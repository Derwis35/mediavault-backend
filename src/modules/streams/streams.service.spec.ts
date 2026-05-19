import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StreamsService } from './streams.service';
import { Stream, StreamProtocol, StreamStatus } from './entities/stream.entity';
import { CreateStreamDto } from './dto/create-stream.dto';
import { WowzaService } from '../wowza/wowza.service';
import { WowzaSecureTokenService } from '../wowza/wowza-secure-token.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { IngestionStatus } from '../ingestion/types/ingestion-status.types';
import { AuditService } from '../audit/audit.service';
import { WowzaSecureToken } from '../wowza/types/wowza-secure-token.types';
import { WowzaPlaybackUrls } from '../wowza/types/wowza-stream.types';

const MOCK_PLAYBACK_URLS: WowzaPlaybackUrls = {
  hls: 'http://wowza:1935/live/cam_lobby/playlist.m3u8',
  llHls: 'http://wowza:1935/live/cam_lobby/playlist.m3u8?chunklist',
  dash: 'http://wowza:1935/live/cam_lobby/manifest.mpd',
  webrtc: 'https://wowza:8090/webrtc/live/cam_lobby',
  rtmp: 'rtmp://wowza:1935/live/cam_lobby',
};

const MOCK_TOKEN: WowzaSecureToken = {
  streamId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  appName: 'live',
  streamName: 'cam_lobby',
  playbackUrls: MOCK_PLAYBACK_URLS,
  expiresAt: '2026-01-01T01:30:00.000Z',
  tokenHash: 'abc123hashabc123hash',
};

const makeStream = (overrides: Partial<Stream> = {}): Stream =>
  ({
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    name: 'Lobby Camera',
    description: 'Main lobby cam',
    wowzaAppName: 'live',
    wowzaStreamName: 'cam_lobby',
    sourceUrl: 'rtsp://admin:secret@192.168.1.10:554/stream',
    protocol: StreamProtocol.RTSP,
    status: StreamStatus.INACTIVE,
    location: 'Lobby principal',
    metadata: {},
    createdBy: { id: 'user-001' },
    events: [],
    evidences: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }) as unknown as Stream;

describe('StreamsService', () => {
  let service: StreamsService;

  const mockStreamRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockQb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  const mockWowzaService = {
    buildPlaybackUrls: jest.fn().mockReturnValue(MOCK_PLAYBACK_URLS),
    getIncomingStream: jest.fn().mockResolvedValue(null),
    getConnections: jest.fn().mockResolvedValue({ total: 0, byApplication: {}, byProtocol: {}, connections: [] }),
  };

  const mockWowzaSecureTokenService = {
    generateSecureToken: jest.fn().mockResolvedValue(MOCK_TOKEN),
  };

  const mockIngestionService = {
    isRunning: jest.fn().mockReturnValue(false),
    getStatus: jest.fn().mockImplementation(() => { throw new NotFoundException('not found'); }),
    startIngestion: jest.fn(),
    stopIngestion: jest.fn(),
  };

  const mockAuditService = {
    logAction: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockStreamRepo.createQueryBuilder.mockReturnValue(mockQb);
    mockQb.getManyAndCount.mockResolvedValue([[], 0]);
    mockWowzaService.buildPlaybackUrls.mockReturnValue(MOCK_PLAYBACK_URLS);
    mockWowzaService.getIncomingStream.mockResolvedValue(null);
    mockIngestionService.isRunning.mockReturnValue(false);
    mockIngestionService.getStatus.mockImplementation(() => {
      throw new NotFoundException('not found');
    });

    const module = await Test.createTestingModule({
      providers: [
        StreamsService,
        { provide: getRepositoryToken(Stream), useValue: mockStreamRepo },
        { provide: WowzaService, useValue: mockWowzaService },
        { provide: WowzaSecureTokenService, useValue: mockWowzaSecureTokenService },
        { provide: IngestionService, useValue: mockIngestionService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<StreamsService>(StreamsService);
  });

  // ─── create() ───────────────────────────────────────────────────────────────

  it('create() should save stream in DB and return StreamResponseDto with playbackUrls', async () => {
    const stream = makeStream();
    mockStreamRepo.findOne.mockResolvedValue(null);
    mockStreamRepo.create.mockReturnValue(stream);
    mockStreamRepo.save.mockResolvedValue(stream);

    const dto: CreateStreamDto = {
      name: 'Lobby Camera',
      wowzaAppName: 'live',
      wowzaStreamName: 'cam_lobby',
      protocol: StreamProtocol.RTSP,
      sourceUrl: 'rtsp://admin:secret@192.168.1.10:554/stream',
    };

    const result = await service.create(dto, 'user-001');

    expect(mockStreamRepo.save).toHaveBeenCalled();
    expect(result.id).toBe(stream.id);
    expect(result.playbackUrls).toEqual(MOCK_PLAYBACK_URLS);
    expect(result.isLiveInWowza).toBe(false);
  });

  it('create() should throw ConflictException if wowzaAppName + wowzaStreamName already exists', async () => {
    mockStreamRepo.findOne.mockResolvedValue(makeStream());

    const dto: CreateStreamDto = {
      name: 'Duplicate',
      wowzaAppName: 'live',
      wowzaStreamName: 'cam_lobby',
      protocol: StreamProtocol.RTSP,
    };

    await expect(service.create(dto, 'user-001')).rejects.toThrow(ConflictException);
    expect(mockStreamRepo.save).not.toHaveBeenCalled();
  });

  // ─── findAll() ──────────────────────────────────────────────────────────────

  it('findAll() should return correct pagination metadata', async () => {
    const streams = [makeStream(), makeStream({ id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee' })];
    mockQb.getManyAndCount.mockResolvedValue([streams, 47]);

    const result = await service.findAll({}, { page: 3, limit: 10 });

    expect(result.meta.page).toBe(3);
    expect(result.meta.limit).toBe(10);
    expect(result.meta.total).toBe(47);
    expect(result.meta.totalPages).toBe(5);
    expect(result.data).toHaveLength(2);
    expect(mockQb.skip).toHaveBeenCalledWith(20);
    expect(mockQb.take).toHaveBeenCalledWith(10);
  });

  it('findAll() should set isLiveInWowza=false when Wowza enrichment throws', async () => {
    mockQb.getManyAndCount.mockResolvedValue([[makeStream()], 1]);
    mockWowzaService.getIncomingStream.mockRejectedValue(new Error('Wowza offline'));

    const result = await service.findAll({}, {});

    expect(result.data[0].isLiveInWowza).toBe(false);
  });

  it('findAll() should clamp limit to max 100', async () => {
    mockQb.getManyAndCount.mockResolvedValue([[], 0]);

    await service.findAll({}, { page: 1, limit: 9999 });

    expect(mockQb.take).toHaveBeenCalledWith(100);
  });

  // ─── findOne() ──────────────────────────────────────────────────────────────

  it('findOne() should throw NotFoundException if stream does not exist', async () => {
    mockStreamRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne('non-existent-uuid')).rejects.toThrow(NotFoundException);
  });

  it('findOne() should return isLiveInWowza=true when ingestion is running', async () => {
    mockStreamRepo.findOne.mockResolvedValue(makeStream());
    mockIngestionService.isRunning.mockReturnValue(true);

    const result = await service.findOne('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

    expect(result.isLiveInWowza).toBe(true);
  });

  // ─── update() ───────────────────────────────────────────────────────────────

  it('update() should throw ConflictException if stream status is ACTIVE', async () => {
    mockStreamRepo.findOne.mockResolvedValue(makeStream({ status: StreamStatus.ACTIVE }));

    await expect(service.update('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', { name: 'New' }, 'user-001'))
      .rejects.toThrow(ConflictException);
  });

  it('update() should throw ConflictException if ingestion is running', async () => {
    mockStreamRepo.findOne.mockResolvedValue(makeStream({ status: StreamStatus.INACTIVE }));
    mockIngestionService.isRunning.mockReturnValue(true);

    await expect(service.update('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', { name: 'New' }, 'user-001'))
      .rejects.toThrow(ConflictException);
  });

  // ─── startIngestion() ───────────────────────────────────────────────────────

  it('startIngestion() should throw BadRequestException if protocol is not RTSP', async () => {
    mockStreamRepo.findOne.mockResolvedValue(makeStream({ protocol: StreamProtocol.RTMP }));

    await expect(service.startIngestion('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'user-001'))
      .rejects.toThrow(BadRequestException);
  });

  it('startIngestion() should throw BadRequestException if sourceUrl is not defined', async () => {
    mockStreamRepo.findOne.mockResolvedValue(makeStream({ sourceUrl: undefined }));

    await expect(service.startIngestion('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'user-001'))
      .rejects.toThrow(BadRequestException);
  });

  it('startIngestion() should call IngestionService.startIngestion with correct RTSPCameraConfig', async () => {
    const stream = makeStream();
    mockStreamRepo.findOne.mockResolvedValue(stream);
    mockStreamRepo.save.mockResolvedValue({ ...stream, status: StreamStatus.CONNECTING });
    mockIngestionService.startIngestion.mockResolvedValue({
      streamId: stream.id,
      streamName: stream.wowzaStreamName,
      status: IngestionStatus.RUNNING,
      reconnectAttempts: 0,
    });

    await service.startIngestion(stream.id, 'user-001');

    expect(mockIngestionService.startIngestion).toHaveBeenCalledWith(
      expect.objectContaining({
        streamId: stream.id,
        streamName: stream.wowzaStreamName,
        rtspUrl: stream.sourceUrl,
        wowzaAppName: stream.wowzaAppName,
      }),
    );
    expect(mockStreamRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: StreamStatus.CONNECTING }),
    );
  });

  // ─── stopIngestion() ────────────────────────────────────────────────────────

  it('stopIngestion() should update stream status to INACTIVE in DB', async () => {
    const stream = makeStream({ status: StreamStatus.CONNECTING });
    mockIngestionService.stopIngestion.mockResolvedValue(undefined);
    mockStreamRepo.findOne.mockResolvedValue(stream);
    mockStreamRepo.save.mockResolvedValue({ ...stream, status: StreamStatus.INACTIVE });

    await service.stopIngestion(stream.id, 'user-001');

    expect(mockStreamRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: StreamStatus.INACTIVE }),
    );
    expect(mockAuditService.logAction).toHaveBeenCalledWith(
      'INGESTION_STOPPED', 'Stream', stream.id, 'user-001',
    );
  });

  // ─── getPlaybackUrl() ───────────────────────────────────────────────────────

  it('getPlaybackUrl() should call generateSecureToken and return WowzaSecureToken', async () => {
    mockStreamRepo.findOne.mockResolvedValue(makeStream());
    mockWowzaSecureTokenService.generateSecureToken.mockResolvedValue(MOCK_TOKEN);

    const result = await service.getPlaybackUrl(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      'session-abc',
      '10.0.0.1',
    );

    expect(mockWowzaSecureTokenService.generateSecureToken).toHaveBeenCalledWith(
      expect.objectContaining({
        streamName: 'cam_lobby',
        appName: 'live',
        clientIp: '10.0.0.1',
        ttlSeconds: 1800,
      }),
      'session-abc',
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    );
    expect(result).toEqual(MOCK_TOKEN);
  });

  // ─── remove() ───────────────────────────────────────────────────────────────

  it('remove() should call stopIngestion before soft-delete when ingestion is active', async () => {
    mockStreamRepo.findOne.mockResolvedValue(makeStream());
    mockIngestionService.isRunning.mockReturnValue(true);
    mockIngestionService.stopIngestion.mockResolvedValue(undefined);
    mockStreamRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.remove('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'user-001');

    expect(mockIngestionService.stopIngestion).toHaveBeenCalledWith(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    );
    expect(mockStreamRepo.softDelete).toHaveBeenCalledWith(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    );
  });

  it('remove() should NOT call stopIngestion when no ingestion is active', async () => {
    mockStreamRepo.findOne.mockResolvedValue(makeStream());
    mockIngestionService.isRunning.mockReturnValue(false);
    mockStreamRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.remove('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'user-001');

    expect(mockIngestionService.stopIngestion).not.toHaveBeenCalled();
    expect(mockStreamRepo.softDelete).toHaveBeenCalled();
  });

  // ─── syncStatusFromWowza() ──────────────────────────────────────────────────

  it('syncStatusFromWowza() should set status ACTIVE when Wowza reports connected', async () => {
    const stream = makeStream({ status: StreamStatus.INACTIVE });
    mockStreamRepo.findOne.mockResolvedValue(stream);
    mockWowzaService.getIncomingStream.mockResolvedValue({ isConnected: true });
    mockStreamRepo.save.mockImplementation((s: Stream) => Promise.resolve(s));

    const result = await service.syncStatusFromWowza(stream.id);

    expect(mockStreamRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: StreamStatus.ACTIVE }),
    );
    expect(result.status).toBe(StreamStatus.ACTIVE);
  });

  it('syncStatusFromWowza() should set status INACTIVE when Wowza says not connected', async () => {
    const stream = makeStream({ status: StreamStatus.ACTIVE });
    mockStreamRepo.findOne.mockResolvedValue(stream);
    mockWowzaService.getIncomingStream.mockResolvedValue(null);
    mockStreamRepo.save.mockImplementation((s: Stream) => Promise.resolve(s));

    const result = await service.syncStatusFromWowza(stream.id);

    expect(result.status).toBe(StreamStatus.INACTIVE);
  });
});
