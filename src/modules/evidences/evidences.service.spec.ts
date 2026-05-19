import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EvidencesService } from './evidences.service';
import { Evidence, EvidenceType } from './entities/evidence.entity';
import { Stream } from '../streams/entities/stream.entity';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { EvidencesStorageService } from './evidences-storage.service';
import { EvidencesIntegrityService } from './evidences-integrity.service';
import { EvidencesExportService } from './evidences-export.service';
import { AuditService } from '../audit/audit.service';
import { StreamingGateway } from '../gateway/streaming.gateway';

const MOCK_EVIDENCE_ID = 'evi-001';
const MOCK_USER_ID = 'user-001';
const MOCK_STREAM_ID = 'stream-001';
const MOCK_HASH = 'a'.repeat(64);

const makeMockEvidence = (overrides: Partial<Evidence> = {}): Evidence =>
  ({
    id: MOCK_EVIDENCE_ID,
    type: EvidenceType.VIDEO,
    storagePath: 'evidences/2025/05/14/video/evi-001.mp4',
    hashSha256: MOCK_HASH,
    fileSizeBytes: '1024',
    durationSeconds: undefined,
    metadata: {},
    recordedAt: new Date('2025-05-14T10:00:00Z'),
    createdAt: new Date('2025-05-14T10:01:00Z'),
    stream: { id: MOCK_STREAM_ID, name: 'Cámara Lobby' } as Stream,
    event: undefined,
    uploadedBy: { id: MOCK_USER_ID, firstName: 'Ana', lastName: 'García', role: { name: 'operator' } } as User,
    ...overrides,
  } as unknown as Evidence);

describe('EvidencesService', () => {
  let service: EvidencesService;

  const mockQb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  const mockEvidenceRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockStreamRepo = { findOne: jest.fn() };
  const mockEventRepo = { findOne: jest.fn() };
  const mockUserRepo = { findOne: jest.fn() };

  const mockStorageService = {
    saveFile: jest.fn(),
    getAbsolutePath: jest.fn().mockReturnValue('/storage/evidences/test.mp4'),
    generateDownloadToken: jest.fn().mockResolvedValue('tok-abc'),
    resolveDownloadToken: jest.fn(),
    invalidateDownloadToken: jest.fn().mockResolvedValue(undefined),
  };

  const mockIntegrityService = {
    computeHashFromBuffer: jest.fn().mockReturnValue(MOCK_HASH),
    verifyIntegrity: jest.fn(),
  };

  const mockExportService = {
    exportEvidence: jest.fn(),
  };

  const mockAuditService = {
    logAction: jest.fn().mockResolvedValue(undefined),
    findByEntity: jest.fn().mockResolvedValue([]),
  };

  const mockGateway = {
    emitEvidenceCreated: jest.fn(),
    emitAlert: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset QB mock
    mockQb.leftJoinAndSelect.mockReturnThis();
    mockQb.andWhere.mockReturnThis();
    mockQb.orderBy.mockReturnThis();
    mockQb.skip.mockReturnThis();
    mockQb.take.mockReturnThis();
    mockQb.getManyAndCount.mockResolvedValue([[], 0]);
    mockEvidenceRepo.createQueryBuilder.mockReturnValue(mockQb);

    const module = await Test.createTestingModule({
      providers: [
        EvidencesService,
        { provide: getRepositoryToken(Evidence), useValue: mockEvidenceRepo },
        { provide: getRepositoryToken(Stream), useValue: mockStreamRepo },
        { provide: getRepositoryToken(Event), useValue: mockEventRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: EvidencesStorageService, useValue: mockStorageService },
        { provide: EvidencesIntegrityService, useValue: mockIntegrityService },
        { provide: EvidencesExportService, useValue: mockExportService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: StreamingGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<EvidencesService>(EvidencesService);
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  it('create() calcula hash ANTES de guardar archivo en disco', async () => {
    const callOrder: string[] = [];
    mockIntegrityService.computeHashFromBuffer.mockImplementation(() => {
      callOrder.push('hash');
      return MOCK_HASH;
    });
    mockStorageService.saveFile.mockImplementation(async () => {
      callOrder.push('save');
      return { path: 'evidences/test.mp4', sizeBytes: 4 };
    });

    const saved = makeMockEvidence();
    mockEvidenceRepo.create.mockReturnValue(saved);
    mockEvidenceRepo.save.mockResolvedValue(saved);

    const file = { buffer: Buffer.from('test'), mimetype: 'video/mp4' } as Express.Multer.File;
    await service.create(
      file,
      { type: EvidenceType.VIDEO, recordedAt: new Date().toISOString() },
      MOCK_USER_ID,
      '127.0.0.1',
    );

    expect(callOrder).toEqual(['hash', 'save']);
  });

  it('create() guarda la evidencia en DB con el hash_sha256 correcto', async () => {
    mockStorageService.saveFile.mockResolvedValue({ path: 'evidences/test.mp4', sizeBytes: 4 });
    const saved = makeMockEvidence();
    mockEvidenceRepo.create.mockReturnValue(saved);
    mockEvidenceRepo.save.mockResolvedValue(saved);

    const file = { buffer: Buffer.from('test'), mimetype: 'video/mp4' } as Express.Multer.File;
    await service.create(
      file,
      { type: EvidenceType.VIDEO, recordedAt: new Date().toISOString() },
      MOCK_USER_ID,
      '',
    );

    expect(mockEvidenceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ hashSha256: MOCK_HASH }),
    );
  });

  it('create() emite WebSocket evidence:created tras guardar', async () => {
    mockStorageService.saveFile.mockResolvedValue({ path: 'evidences/test.mp4', sizeBytes: 4 });
    const saved = makeMockEvidence();
    mockEvidenceRepo.create.mockReturnValue(saved);
    mockEvidenceRepo.save.mockResolvedValue(saved);

    const file = { buffer: Buffer.from('test'), mimetype: 'video/mp4' } as Express.Multer.File;
    await service.create(
      file,
      { type: EvidenceType.VIDEO, recordedAt: new Date().toISOString() },
      MOCK_USER_ID,
      '',
    );

    expect(mockGateway.emitEvidenceCreated).toHaveBeenCalledTimes(1);
  });

  // ─── createSnapshot() ─────────────────────────────────────────────────────

  it('createSnapshot() lanza BadRequestException si base64 decodificado supera 10MB', async () => {
    const bigBuffer = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    const bigBase64 = bigBuffer.toString('base64');

    await expect(
      service.createSnapshot({ streamId: MOCK_STREAM_ID, imageBase64: bigBase64 }, MOCK_USER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('createSnapshot() lanza BadRequestException si el buffer no tiene cabecera PNG/JPEG válida', async () => {
    const invalidBuf = Buffer.from('esto no es una imagen valida');
    const invalidBase64 = invalidBuf.toString('base64');

    await expect(
      service.createSnapshot({ streamId: MOCK_STREAM_ID, imageBase64: invalidBase64 }, MOCK_USER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  // ─── findAll() ────────────────────────────────────────────────────────────

  it('findAll() viewer solo ve sus propias evidencias (WHERE uploadedBy.id = viewerUserId)', async () => {
    mockQb.getManyAndCount.mockResolvedValue([[], 0]);

    await service.findAll({}, MOCK_USER_ID, 'viewer');

    expect(mockQb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('uploadedBy.id'),
      expect.objectContaining({ viewerUserId: MOCK_USER_ID }),
    );
  });

  it('findAll() operator no restringe por userId', async () => {
    mockQb.getManyAndCount.mockResolvedValue([[], 0]);

    await service.findAll({}, MOCK_USER_ID, 'operator');

    const viewerCalls = (mockQb.andWhere as jest.Mock).mock.calls.filter((args: unknown[]) =>
      typeof args[0] === 'string' && args[0].includes('viewerUserId'),
    );
    expect(viewerCalls).toHaveLength(0);
  });

  // ─── findOne() ────────────────────────────────────────────────────────────

  it('findOne() viewer lanza ForbiddenException si la evidencia pertenece a otro usuario', async () => {
    const evidence = makeMockEvidence({ uploadedBy: { id: 'otro-user' } as User });
    mockEvidenceRepo.findOne.mockResolvedValue(evidence);

    await expect(service.findOne(MOCK_EVIDENCE_ID, MOCK_USER_ID, 'viewer')).rejects.toThrow(
      ForbiddenException,
    );
  });

  // ─── verifyIntegrity() ────────────────────────────────────────────────────

  it('verifyIntegrity() retorna isValid: true cuando el hash coincide', async () => {
    mockEvidenceRepo.findOne.mockResolvedValue(makeMockEvidence());
    mockIntegrityService.verifyIntegrity.mockResolvedValue({
      isValid: true,
      computedHash: MOCK_HASH,
      expectedHash: MOCK_HASH,
      verifiedAt: new Date().toISOString(),
    });

    const result = await service.verifyIntegrity(MOCK_EVIDENCE_ID, MOCK_USER_ID);

    expect(result.isValid).toBe(true);
    expect(mockGateway.emitAlert).not.toHaveBeenCalled();
  });

  it('verifyIntegrity() emite alerta crítica via gateway si isValid: false', async () => {
    mockEvidenceRepo.findOne.mockResolvedValue(makeMockEvidence());
    mockIntegrityService.verifyIntegrity.mockResolvedValue({
      isValid: false,
      computedHash: 'b'.repeat(64),
      expectedHash: MOCK_HASH,
      verifiedAt: new Date().toISOString(),
    });

    const result = await service.verifyIntegrity(MOCK_EVIDENCE_ID, MOCK_USER_ID);

    expect(result.isValid).toBe(false);
    expect(mockGateway.emitAlert).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'critical', category: 'stream' }),
    );
  });

  // ─── exportEvidence() ─────────────────────────────────────────────────────

  it('exportEvidence() retorna un buffer ZIP no vacío con filename correcto', async () => {
    const evidence = makeMockEvidence();
    mockEvidenceRepo.findOne.mockResolvedValue(evidence);
    mockAuditService.findByEntity.mockResolvedValue([]);
    mockExportService.exportEvidence.mockResolvedValue(Buffer.from('PK zip content'));

    const result = await service.exportEvidence(MOCK_EVIDENCE_ID, MOCK_USER_ID);

    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.filename).toContain(MOCK_EVIDENCE_ID);
    expect(result.filename).toMatch(/\.zip$/);
  });

  // ─── remove() ─────────────────────────────────────────────────────────────

  it('remove() hace soft delete en DB y registra audit log', async () => {
    mockEvidenceRepo.findOne.mockResolvedValue(makeMockEvidence());

    await service.remove(MOCK_EVIDENCE_ID, MOCK_USER_ID);

    expect(mockEvidenceRepo.softDelete).toHaveBeenCalledWith(MOCK_EVIDENCE_ID);
    expect(mockAuditService.logAction).toHaveBeenCalledWith(
      'EVIDENCE_DELETED',
      'Evidence',
      MOCK_EVIDENCE_ID,
      MOCK_USER_ID,
    );
  });

  it('remove() lanza NotFoundException si la evidencia no existe', async () => {
    mockEvidenceRepo.findOne.mockResolvedValue(null);

    await expect(service.remove('inexistente', MOCK_USER_ID)).rejects.toThrow(NotFoundException);
  });
});
