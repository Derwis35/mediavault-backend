import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { StreamingGateway } from './streaming.gateway';
import { StreamsService } from '../streams/streams.service';
import { WowzaService } from '../wowza/wowza.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { RedisService } from '../redis/redis.service';
import { ServerToClientEvents } from './types/socket-events.types';
import { AlertPayload } from './types/socket-payload.types';

const MOCK_JWT_PAYLOAD = { sub: 'user-001', email: 'admin@test.com', role: 'admin', sessionId: 'session-001' };

const makeClient = (overrides: Record<string, unknown> = {}) => ({
  id: 'socket-001',
  data: {} as Record<string, unknown>,
  handshake: { auth: { token: 'Bearer valid-token' } },
  join: jest.fn().mockResolvedValue(undefined),
  leave: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
  emit: jest.fn(),
  ...overrides,
});

const MOCK_META = { page: 1, limit: 1, total: 0, totalPages: 1 };

describe('StreamingGateway', () => {
  let gateway: StreamingGateway;

  const mockStreamsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    syncStatusFromWowza: jest.fn(),
  };

  const mockWowzaService = {
    getServerStatus: jest.fn(),
  };

  const mockIngestionService = {
    isRunning: jest.fn().mockReturnValue(false),
    getStatus: jest.fn().mockImplementation(() => { throw new Error('not found'); }),
  };

  const mockJwtService = {
    verify: jest.fn().mockReturnValue(MOCK_JWT_PAYLOAD),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('jwt_secret'),
  };

  const mockRedisService = {
    exists: jest.fn().mockResolvedValue(false),
  };

  const mockTo = { emit: jest.fn() };
  const mockServer = { to: jest.fn().mockReturnValue(mockTo) };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockStreamsService.findAll.mockResolvedValue({ data: [], meta: MOCK_META });
    mockStreamsService.findOne.mockResolvedValue({
      id: 'stream-001',
      wowzaStreamName: 'cam_lobby',
      status: 'inactive',
      isLiveInWowza: false,
    });
    mockStreamsService.syncStatusFromWowza.mockResolvedValue({
      id: 'stream-001',
      wowzaStreamName: 'cam_lobby',
      status: 'inactive',
      isLiveInWowza: false,
    });
    mockWowzaService.getServerStatus.mockResolvedValue({ isOnline: true, version: '4.8.0', uptime: 1000 });
    mockJwtService.verify.mockReturnValue(MOCK_JWT_PAYLOAD);
    mockConfigService.get.mockReturnValue('jwt_secret');
    mockRedisService.exists.mockResolvedValue(false);
    mockIngestionService.isRunning.mockReturnValue(false);

    const module = await Test.createTestingModule({
      providers: [
        StreamingGateway,
        { provide: StreamsService, useValue: mockStreamsService },
        { provide: WowzaService, useValue: mockWowzaService },
        { provide: IngestionService, useValue: mockIngestionService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    gateway = module.get<StreamingGateway>(StreamingGateway);
    (gateway as any).server = mockServer;
  });

  // ─── handleConnection() ────────────────────────────────────────────────────

  it('handleConnection() should register client in connectedClients when auth succeeds', async () => {
    const client = makeClient();

    await gateway.handleConnection(client as any);

    expect((gateway as any).connectedClients.has('socket-001')).toBe(true);
    expect(client.join).toHaveBeenCalledWith('all');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('handleConnection() should disconnect client when auth fails', async () => {
    const client = makeClient();
    mockJwtService.verify.mockImplementationOnce(() => { throw new Error('invalid token'); });

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect((gateway as any).connectedClients.has('socket-001')).toBe(false);
  });

  // ─── handleDisconnect() ────────────────────────────────────────────────────

  it('handleDisconnect() should remove client from connectedClients', async () => {
    const client = makeClient();
    await gateway.handleConnection(client as any);
    expect((gateway as any).connectedClients.has('socket-001')).toBe(true);

    gateway.handleDisconnect(client as any);

    expect((gateway as any).connectedClients.has('socket-001')).toBe(false);
  });

  // ─── handleSubscribeStream() ───────────────────────────────────────────────

  it('handleSubscribeStream() should join socket to the correct room', async () => {
    const client = makeClient();
    (gateway as any).connectedClients.set('socket-001', {
      userId: 'user-001',
      email: 'admin@test.com',
      role: 'admin',
      connectedAt: new Date(),
      subscribedStreams: new Set<string>(),
    });

    const result = await gateway.handleSubscribeStream(client as any, 'stream-001');

    expect(client.join).toHaveBeenCalledWith('stream:stream-001');
    expect(result).toEqual({ subscribed: true, streamId: 'stream-001' });
    expect(
      (gateway as any).connectedClients.get('socket-001').subscribedStreams.has('stream-001'),
    ).toBe(true);
  });

  // ─── handleUnsubscribeStream() ─────────────────────────────────────────────

  it('handleUnsubscribeStream() should leave socket room and return ack', async () => {
    const client = makeClient();
    const clientData = {
      userId: 'user-001',
      email: 'admin@test.com',
      role: 'admin',
      connectedAt: new Date(),
      subscribedStreams: new Set<string>(['stream-001']),
    };
    (gateway as any).connectedClients.set('socket-001', clientData);

    const result = await gateway.handleUnsubscribeStream(client as any, 'stream-001');

    expect(client.leave).toHaveBeenCalledWith('stream:stream-001');
    expect(result).toEqual({ unsubscribed: true, streamId: 'stream-001' });
    expect(clientData.subscribedStreams.has('stream-001')).toBe(false);
  });

  // ─── pollWowzaStatus() ─────────────────────────────────────────────────────

  it('pollWowzaStatus() should skip polling when no clients are connected', async () => {
    await (gateway as any).pollWowzaStatus();

    expect(mockStreamsService.findAll).not.toHaveBeenCalled();
    expect(mockStreamsService.syncStatusFromWowza).not.toHaveBeenCalled();
  });

  it('pollWowzaStatus() should emit STREAM_STATUS_CHANGED when status changes', async () => {
    const stream = {
      id: 'stream-001',
      wowzaStreamName: 'cam_lobby',
      status: 'inactive',
      isLiveInWowza: false,
    };

    mockStreamsService.findAll.mockResolvedValue({
      data: [stream],
      meta: { ...MOCK_META, total: 1 },
    });
    mockStreamsService.syncStatusFromWowza.mockResolvedValue({ ...stream, status: 'active' });

    (gateway as any).connectedClients.set('socket-001', {
      userId: 'user-001',
      email: 'admin@test.com',
      role: 'admin',
      connectedAt: new Date(),
      subscribedStreams: new Set<string>(),
    });
    (gateway as any).lastKnownStatus.set('stream-001', 'inactive');

    await (gateway as any).pollWowzaStatus();

    expect(mockServer.to).toHaveBeenCalledWith('stream:stream-001');
    expect(mockTo.emit).toHaveBeenCalledWith(
      ServerToClientEvents.STREAM_STATUS_CHANGED,
      expect.objectContaining({
        streamId: 'stream-001',
        previousStatus: 'inactive',
        currentStatus: 'active',
      }),
    );
  });

  it('pollWowzaStatus() should NOT emit STREAM_STATUS_CHANGED if status has not changed', async () => {
    const stream = {
      id: 'stream-001',
      wowzaStreamName: 'cam_lobby',
      status: 'inactive',
      isLiveInWowza: false,
    };

    mockStreamsService.findAll.mockResolvedValue({
      data: [stream],
      meta: { ...MOCK_META, total: 1 },
    });
    mockStreamsService.syncStatusFromWowza.mockResolvedValue({ ...stream, status: 'inactive' });

    (gateway as any).connectedClients.set('socket-001', {
      userId: 'user-001',
      email: 'admin@test.com',
      role: 'admin',
      connectedAt: new Date(),
      subscribedStreams: new Set<string>(),
    });
    (gateway as any).lastKnownStatus.set('stream-001', 'inactive');

    await (gateway as any).pollWowzaStatus();

    const statusChangeCall = mockTo.emit.mock.calls.find(
      (call: unknown[]) => call[0] === ServerToClientEvents.STREAM_STATUS_CHANGED,
    );
    expect(statusChangeCall).toBeUndefined();
  });

  // ─── emitAlert() ───────────────────────────────────────────────────────────

  it('emitAlert() should call server.to("all").emit() with the correct payload', () => {
    const payload: AlertPayload = {
      id: 'alert-001',
      level: 'warning',
      category: 'stream',
      title: 'Stream offline',
      message: 'La cámara principal se desconectó',
      timestamp: new Date().toISOString(),
    };

    gateway.emitAlert(payload);

    expect(mockServer.to).toHaveBeenCalledWith('all');
    expect(mockTo.emit).toHaveBeenCalledWith(ServerToClientEvents.ALERT_NEW, payload);
  });

  // ─── onApplicationShutdown() ───────────────────────────────────────────────

  it('onApplicationShutdown() should clear the polling interval', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const fakeInterval = setInterval(() => {}, 100_000);
    (gateway as any).pollingInterval = fakeInterval;

    gateway.onApplicationShutdown();

    expect(clearIntervalSpy).toHaveBeenCalledWith(fakeInterval);
    expect((gateway as any).pollingInterval).toBeNull();

    clearIntervalSpy.mockRestore();
  });
});
