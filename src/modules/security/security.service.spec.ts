import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SecurityService } from './security.service';
import { Session } from '../auth/entities/session.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../redis/redis.service';
import { StreamingGateway } from '../gateway/streaming.gateway';

const MOCK_USER_ID = 'user-001';
const MOCK_SESSION_ID = 'sess-001';
const FUTURE = new Date(Date.now() + 8 * 60 * 60 * 1000);

const makeSession = (overrides: Partial<Session> = {}): Session =>
  ({
    id: MOCK_SESSION_ID,
    tokenHash: 'hash-abc',
    refreshTokenHash: 'rhash-abc',
    ipAddress: '10.0.0.1',
    userAgent: 'Mozilla/5.0',
    expiresAt: FUTURE,
    createdAt: new Date(),
    user: {
      id: MOCK_USER_ID,
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'García',
      role: { name: 'operator' },
    },
    ...overrides,
  } as unknown as Session);

describe('SecurityService', () => {
  let service: SecurityService;

  const mockSessionQb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  const mockAuditQb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
  };

  const mockSessionRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(mockSessionQb),
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockAuditRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(mockAuditQb),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };

  const mockRedis = {
    set: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
    countKeys: jest.fn().mockResolvedValue(0),
  };

  const mockAuditService = {
    logAction: jest.fn().mockResolvedValue(undefined),
  };

  const mockGateway = {
    emitAlert: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset QBs
    mockSessionQb.leftJoinAndSelect.mockReturnThis();
    mockSessionQb.andWhere.mockReturnThis();
    mockSessionQb.where.mockReturnThis();
    mockSessionQb.orderBy.mockReturnThis();
    mockSessionQb.getMany.mockResolvedValue([]);

    mockAuditQb.select.mockReturnThis();
    mockAuditQb.addSelect.mockReturnThis();
    mockAuditQb.where.mockReturnThis();
    mockAuditQb.andWhere.mockReturnThis();
    mockAuditQb.groupBy.mockReturnThis();
    mockAuditQb.addGroupBy.mockReturnThis();
    mockAuditQb.having.mockReturnThis();
    mockAuditQb.getRawMany.mockResolvedValue([]);

    mockSessionRepo.createQueryBuilder.mockReturnValue(mockSessionQb);
    mockAuditRepo.createQueryBuilder.mockReturnValue(mockAuditQb);

    const module = await Test.createTestingModule({
      providers: [
        SecurityService,
        { provide: getRepositoryToken(Session), useValue: mockSessionRepo },
        { provide: getRepositoryToken(AuditLog), useValue: mockAuditRepo },
        { provide: RedisService, useValue: mockRedis },
        { provide: AuditService, useValue: mockAuditService },
        { provide: StreamingGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<SecurityService>(SecurityService);
  });

  // ─── getActiveSessions() ──────────────────────────────────────────────────

  it('getActiveSessions() solo retorna sesiones con expiresAt > NOW()', async () => {
    const activeSess = makeSession();
    mockSessionQb.getMany.mockResolvedValue([activeSess]);

    const result = await service.getActiveSessions();

    expect(result).toHaveLength(1);
    expect(mockSessionQb.where).toHaveBeenCalledWith(
      expect.stringContaining('expiresAt'),
      expect.objectContaining({ now: expect.any(Date) }),
    );
  });

  // ─── revokeSession() ──────────────────────────────────────────────────────

  it('revokeSession() agrega tokenHash a Redis blacklist antes de eliminar de DB', async () => {
    const callOrder: string[] = [];
    mockSessionRepo.findOne.mockResolvedValue(makeSession());
    mockRedis.set.mockImplementation(async () => { callOrder.push('redis'); });
    mockSessionRepo.delete.mockImplementation(async () => { callOrder.push('delete'); return { affected: 1 }; });

    await service.revokeSession(MOCK_SESSION_ID, 'admin-001');

    expect(callOrder[0]).toBe('redis');
    expect(callOrder[1]).toBe('delete');
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining('blacklist:hash-abc'),
      '1',
      expect.any(Number),
    );
  });

  it('revokeSession() lanza NotFoundException si la sesión no existe', async () => {
    mockSessionRepo.findOne.mockResolvedValue(null);

    await expect(service.revokeSession('inexistente', 'admin-001')).rejects.toThrow(
      NotFoundException,
    );
  });

  // ─── revokeAllUserSessions() ──────────────────────────────────────────────

  it('revokeAllUserSessions() retorna el conteo correcto de sesiones revocadas', async () => {
    const sessions = [makeSession(), makeSession({ id: 'sess-002', tokenHash: 'hash-xyz' })];
    mockSessionRepo.find.mockResolvedValue(sessions);

    const count = await service.revokeAllUserSessions(MOCK_USER_ID, 'admin-001');

    expect(count).toBe(2);
    expect(mockRedis.set).toHaveBeenCalledTimes(2);
    expect(mockSessionRepo.delete).toHaveBeenCalledWith({ user: { id: MOCK_USER_ID } });
  });

  // ─── detectAnomalies() ────────────────────────────────────────────────────

  it('detectAnomalies() detecta usuario con 6+ LOGIN_FAILED en 1h', async () => {
    // First call to createQueryBuilder (LOGIN_FAILED check) returns the anomaly
    mockAuditQb.getRawMany
      .mockResolvedValueOnce([{ userId: MOCK_USER_ID, ipAddress: '1.2.3.4', occurrences: '6' }])
      .mockResolvedValueOnce([]) // EVIDENCE_DOWNLOADED
      .mockResolvedValueOnce([]); // after-hours
    mockAuditRepo.find.mockResolvedValue([]); // new IP check

    const anomalies = await service.detectAnomalies();

    const failedLogin = anomalies.find((a) => a.type === 'MULTIPLE_FAILED_LOGINS');
    expect(failedLogin).toBeDefined();
    expect(failedLogin?.level).toBe('warning');
    expect(failedLogin?.userId).toBe(MOCK_USER_ID);
    expect(failedLogin?.occurrences).toBe(6);
  });

  it('detectAnomalies() detecta 20+ EVIDENCE_DOWNLOADED en 1h → nivel critical', async () => {
    mockAuditQb.getRawMany
      .mockResolvedValueOnce([]) // LOGIN_FAILED
      .mockResolvedValueOnce([{ userId: MOCK_USER_ID, occurrences: '25' }]) // EVIDENCE_DOWNLOADED
      .mockResolvedValueOnce([]); // after-hours
    mockAuditRepo.find.mockResolvedValue([]);

    const anomalies = await service.detectAnomalies();

    const massDownload = anomalies.find((a) => a.type === 'MASS_EVIDENCE_DOWNLOAD');
    expect(massDownload).toBeDefined();
    expect(massDownload?.level).toBe('critical');
    expect(massDownload?.occurrences).toBe(25);
  });

  // ─── getSecurityReport() ──────────────────────────────────────────────────

  it('getSecurityReport() retorna activeSessions y anomalies correctamente', async () => {
    mockSessionQb.getMany.mockResolvedValue([makeSession()]);
    mockAuditRepo.count.mockResolvedValue(3);
    mockRedis.countKeys.mockResolvedValue(5);
    mockAuditRepo.find.mockResolvedValue([]);
    mockAuditQb.getRawMany.mockResolvedValue([]);

    const report = await service.getSecurityReport();

    expect(report.activeSessions).toBe(1);
    expect(report.failedLoginsLast24h).toBe(3);
    expect(report.wowzaTokensActive).toBe(5);
    expect(Array.isArray(report.anomalies)).toBe(true);
    expect(report.generatedAt).toBeTruthy();
    expect(report.activeSessionsByRole).toHaveProperty('operator');
  });
});
