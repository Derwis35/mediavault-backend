import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

const makeMockEntry = (overrides: Partial<AuditLog> = {}): AuditLog =>
  ({
    id: '1',
    action: 'LOGIN',
    entityType: 'User',
    entityId: 'user-001',
    userId: 'user-001',
    ipAddress: '127.0.0.1',
    metadata: {},
    createdAt: new Date('2025-05-14T10:00:00Z'),
    ...overrides,
  } as AuditLog);

describe('AuditService', () => {
  let service: AuditService;

  const mockQb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawMany: jest.fn().mockResolvedValue([]),
  };

  const mockRepo = {
    save: jest.fn().mockResolvedValue({}),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue(mockQb),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset QB
    Object.keys(mockQb).forEach((k) => {
      if (typeof mockQb[k] === 'function') {
        if (k === 'getManyAndCount') {
          mockQb[k] = jest.fn().mockResolvedValue([[], 0]);
        } else if (k === 'getMany' || k === 'getRawMany') {
          mockQb[k] = jest.fn().mockResolvedValue([]);
        } else {
          mockQb[k] = jest.fn().mockReturnThis();
        }
      }
    });
    mockRepo.createQueryBuilder.mockReturnValue(mockQb);

    const module = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditLog), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  // ─── log() ────────────────────────────────────────────────────────────────

  it('log() NO propaga excepciones si el INSERT falla', async () => {
    mockRepo.save.mockRejectedValue(new Error('DB connection failed'));

    await expect(service.log({ action: 'TEST_ACTION' })).resolves.not.toThrow();
  });

  // ─── findAll() ────────────────────────────────────────────────────────────

  it('findAll() aplica filtros de fecha cuando se proporcionan fromDate y toDate', async () => {
    mockQb.getManyAndCount.mockResolvedValue([[makeMockEntry()], 1]);

    const result = await service.findAll({
      fromDate: '2025-01-01T00:00:00Z',
      toDate: '2025-12-31T23:59:59Z',
    });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(mockQb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('createdAt'),
      expect.objectContaining({ fromDate: expect.any(Date), toDate: expect.any(Date) }),
    );
  });

  // ─── findByEntity() ───────────────────────────────────────────────────────

  it('findByEntity() retorna entradas en orden cronológico ASC', async () => {
    const entries = [
      makeMockEntry({ createdAt: new Date('2025-05-14T08:00:00Z') }),
      makeMockEntry({ createdAt: new Date('2025-05-14T09:00:00Z') }),
    ];
    mockRepo.find.mockResolvedValue(entries);

    const result = await service.findByEntity('Evidence', 'evi-001');

    expect(result).toHaveLength(2);
    expect(mockRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { createdAt: 'ASC' },
      }),
    );
  });

  // ─── exportToCsv() ────────────────────────────────────────────────────────

  it('exportToCsv() genera cabecera CSV correcta', async () => {
    mockQb.getMany.mockResolvedValue([makeMockEntry()]);

    const csv = await service.exportToCsv({});

    const lines = csv.split('\n');
    expect(lines[0]).toContain('id');
    expect(lines[0]).toContain('timestamp');
    expect(lines[0]).toContain('action');
    expect(lines[0]).toContain('ip_address');
  });

  it('exportToCsv() lanza BadRequestException si resultados > 10000', async () => {
    const manyEntries = Array.from({ length: 10001 }, (_, i) =>
      makeMockEntry({ id: String(i + 1) }),
    );
    mockQb.getMany.mockResolvedValue(manyEntries);

    await expect(service.exportToCsv({})).rejects.toThrow(BadRequestException);
  });

  // ─── getActionSummary() ───────────────────────────────────────────────────

  it('getActionSummary() retorna acciones ordenadas por count DESC', async () => {
    mockQb.getRawMany.mockResolvedValue([
      { action: 'LOGIN', count: '50' },
      { action: 'EVIDENCE_VIEWED', count: '20' },
    ]);

    const result = await service.getActionSummary();

    expect(result[0].action).toBe('LOGIN');
    expect(result[0].count).toBe(50);
    expect(result[1].count).toBe(20);
  });
});
