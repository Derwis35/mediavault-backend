import { HttpService } from '@nestjs/axios';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
import { WowzaServer } from '../../wowza-servers/entities/wowza-server.entity';
import { RedisService } from '../redis/redis.service';
import { WowzaSecureTokenService } from './wowza-secure-token.service';
import { WowzaService } from './wowza.service';

const makeAxiosError = (status?: number, code?: string) => {
  const err = Object.assign(new Error('Request failed'), {
    isAxiosError: true,
    code: code ?? undefined,
    response: status !== undefined ? { status, data: `Error ${status}` } : undefined,
  });
  return err;
};

const mockHttpService = {
  get: jest.fn(),
  put: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    const cfg: Record<string, string | number> = {
      'wowza.host': 'localhost',
      'wowza.port': 8087,
      'wowza.user': 'admin',
      'wowza.password': 'testpassword',
      'wowza.streamPort': 1935,
      'wowza.secureTokenSecret': 'test_secret_32_chars_minimum_ok',
    };
    return cfg[key];
  }),
};

const mockRedisService = {
  getOrSet: jest.fn().mockImplementation(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  invalidate: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(undefined),
  exists: jest.fn().mockResolvedValue(false),
};

// Repo mock: devuelve null → getActiveServer hace fallback a variables de entorno
const mockWowzaServersRepo = {
  findOne: jest.fn().mockResolvedValue(null),
};

describe('WowzaService', () => {
  let wowzaService: WowzaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WowzaService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: getRepositoryToken(WowzaServer), useValue: mockWowzaServersRepo },
      ],
    }).compile();

    wowzaService = module.get<WowzaService>(WowzaService);
    jest.clearAllMocks();
    mockRedisService.getOrSet.mockImplementation(
      async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
    );
    mockWowzaServersRepo.findOne.mockResolvedValue(null);
  });

  it('getApplications() should return the applications list', async () => {
    const apps = [
      { id: '1', name: 'live', description: '', appType: 'Live', streamConfig: { storageDir: '', streamType: '' } },
    ];
    mockHttpService.get.mockReturnValue(of({ data: { applications: apps } }));

    const result = await wowzaService.getApplications();

    expect(result).toEqual(apps);
    expect(mockHttpService.get).toHaveBeenCalledWith(
      expect.stringContaining('/applications'),
      expect.any(Object),
    );
  });

  it('getIncomingStream() should return null when Wowza responds with 404', async () => {
    mockHttpService.get.mockReturnValue(throwError(() => makeAxiosError(404)));

    const result = await wowzaService.getIncomingStream('live', 'myStream');

    expect(result).toBeNull();
  });

  it('getServerStatus() should return isOnline: false when Wowza is unavailable', async () => {
    mockHttpService.get.mockReturnValue(throwError(() => makeAxiosError(undefined, 'ECONNREFUSED')));

    const result = await wowzaService.getServerStatus();

    expect(result.isOnline).toBe(false);
    expect(result.version).toBe('unknown');
    expect(result.uptime).toBe(0);
  });

  it('buildPlaybackUrls() should construct all five URLs with the correct host and ports', async () => {
    const urls = await wowzaService.buildPlaybackUrls('live', 'testStream');

    expect(urls.hls).toBe('http://localhost:1935/live/testStream/playlist.m3u8');
    expect(urls.llHls).toBe('http://localhost:1935/live/testStream/playlist.m3u8?chunklist');
    expect(urls.dash).toBe('http://localhost:1935/live/testStream/manifest.mpd');
    expect(urls.webrtc).toBe('https://localhost:8090/webrtc/live/testStream');
    expect(urls.rtmp).toBe('rtmp://localhost:1935/live/testStream');
  });

  it('getActiveServer() should use DB server when repo returns a record', async () => {
    const dbServer = {
      id: 'db-server-uuid',
      ip: '10.0.0.5',
      portApi: 8087,
      portStream: 1935,
      portHls: 8088,
      apiUser: 'wowza_user',
      apiPassword: 'wowza_pass',
      appName: 'live',
      isDefault: true,
      isActive: true,
    };
    mockWowzaServersRepo.findOne.mockResolvedValue(dbServer);

    const apps = [{ id: '1', name: 'live', description: '', appType: 'Live', streamConfig: { storageDir: '', streamType: '' } }];
    mockHttpService.get.mockReturnValue(of({ data: { applications: apps } }));

    await wowzaService.getApplications();

    expect(mockHttpService.get).toHaveBeenCalledWith(
      expect.stringContaining('10.0.0.5:8087'),
      expect.any(Object),
    );
  });
});

describe('WowzaSecureTokenService', () => {
  let secureTokenService: WowzaSecureTokenService;

  const mockWowzaService = {
    buildPlaybackUrls: jest.fn().mockResolvedValue({
      hls: 'http://localhost:1935/live/testStream/playlist.m3u8',
      llHls: 'http://localhost:1935/live/testStream/playlist.m3u8?chunklist',
      dash: 'http://localhost:1935/live/testStream/manifest.mpd',
      webrtc: 'https://localhost:8090/webrtc/live/testStream',
      rtmp: 'rtmp://localhost:1935/live/testStream',
    }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WowzaSecureTokenService,
        { provide: WowzaService, useValue: mockWowzaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    secureTokenService = module.get<WowzaSecureTokenService>(WowzaSecureTokenService);
    jest.clearAllMocks();
    mockWowzaService.buildPlaybackUrls.mockResolvedValue({
      hls: 'http://localhost:1935/live/testStream/playlist.m3u8',
      llHls: 'http://localhost:1935/live/testStream/playlist.m3u8?chunklist',
      dash: 'http://localhost:1935/live/testStream/manifest.mpd',
      webrtc: 'https://localhost:8090/webrtc/live/testStream',
      rtmp: 'rtmp://localhost:1935/live/testStream',
    });
    mockRedisService.set.mockResolvedValue(undefined);
    mockRedisService.exists.mockResolvedValue(false);
  });

  it('generateSecureToken() should include wowzaTokenHash in all playback URLs', async () => {
    const result = await secureTokenService.generateSecureToken(
      { streamName: 'testStream', appName: 'live', clientIp: '192.168.1.1' },
      'session-123',
    );

    expect(result.tokenHash).toBeDefined();
    expect(result.tokenHash).toHaveLength(64); // SHA-256 hex = 64 chars
    for (const url of Object.values(result.playbackUrls)) {
      expect(url).toContain('wowzaTokenHash=');
      expect(url).toContain('wowzaTokenStartTime=');
      expect(url).toContain('wowzaTokenEndTime=');
    }
  });

  it('generateSecureToken() should save the token in Redis with TTL = ttlSeconds + 60', async () => {
    const ttlSeconds = 600;

    await secureTokenService.generateSecureToken(
      { streamName: 'testStream', appName: 'live', ttlSeconds },
      'session-456',
    );

    expect(mockRedisService.set).toHaveBeenCalledWith(
      'wowza_token:testStream:session-456',
      expect.any(String),
      ttlSeconds + 60,
    );
  });

  it('isTokenValid() should return false when the Redis key does not exist', async () => {
    mockRedisService.exists.mockResolvedValue(false);

    const result = await secureTokenService.isTokenValid('stream-id-999', 'session-xyz');

    expect(result).toBe(false);
    expect(mockRedisService.exists).toHaveBeenCalledWith('wowza_token:stream-id-999:session-xyz');
  });
});
