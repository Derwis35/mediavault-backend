import * as cp from 'child_process';
import { EventEmitter } from 'events';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IngestionService } from './ingestion.service';
import { IngestionStatus } from './types/ingestion-status.types';
import {
  AudioCodecStrategy,
  StreamTransportProtocol,
  VideoCodecStrategy,
} from './types/ingestion-config.types';

jest.mock('child_process');
const spawnMock = cp.spawn as jest.MockedFunction<typeof cp.spawn>;

const makeProcess = (pid = 42000) => {
  const proc = new EventEmitter() as EventEmitter & {
    pid: number;
    kill: jest.Mock;
    stderr: EventEmitter;
    stdout: EventEmitter;
    stdin: null;
  };
  proc.pid = pid;
  proc.kill = jest.fn();
  proc.stderr = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stdin = null;
  return proc;
};

const BASE_CONFIG = {
  streamId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  streamName: 'cam_lobby',
  rtspUrl: 'rtsp://admin:secret123@192.168.1.1:554/stream',
  wowzaAppName: 'live',
  transport: StreamTransportProtocol.TCP,
  videoCodec: VideoCodecStrategy.COPY,
  audioCodec: AudioCodecStrategy.AAC,
  reconnectDelayMs: 1000,
  maxReconnectAttempts: 3,
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'wowza.host') return 'wowza-host';
    if (key === 'wowza.streamPort') return 1935;
    return undefined;
  }),
};

describe('IngestionService', () => {
  let service: IngestionService;

  beforeEach(async () => {
    jest.useFakeTimers();
    spawnMock.mockImplementation(() => makeProcess() as unknown as cp.ChildProcess);

    const module = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
    service['ffmpegAvailable'] = true;

    jest.clearAllMocks();
    spawnMock.mockImplementation(() => makeProcess() as unknown as cp.ChildProcess);
  });

  afterEach(() => {
    service['processes'].clear();
    service['states'].clear();
    service['configs'].clear();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('startIngestion() should throw ConflictException if stream is already RUNNING', async () => {
    const mockProc = makeProcess();
    spawnMock.mockReturnValue(mockProc as unknown as cp.ChildProcess);

    await service.startIngestion(BASE_CONFIG);

    await expect(service.startIngestion(BASE_CONFIG)).rejects.toThrow(ConflictException);
  });

  it('startIngestion() should spawn ffmpeg with TCP transport, COPY video and AAC audio args', async () => {
    const mockProc = makeProcess();
    spawnMock.mockReturnValue(mockProc as unknown as cp.ChildProcess);

    await service.startIngestion(BASE_CONFIG);

    expect(spawnMock).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining([
        '-rtsp_transport', 'tcp',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-f', 'flv',
      ]),
      expect.objectContaining({ shell: false }),
    );
  });

  it('startIngestion() should sanitize RTSP credentials in the logged ffmpegCommand', async () => {
    const mockProc = makeProcess();
    spawnMock.mockReturnValue(mockProc as unknown as cp.ChildProcess);

    const state = await service.startIngestion(BASE_CONFIG);

    expect(state.ffmpegCommand).toContain('***:***@');
    expect(state.ffmpegCommand).not.toContain('admin:secret123');
  });

  it('stopIngestion() should kill the process with SIGTERM', async () => {
    const mockProc = makeProcess();
    spawnMock.mockReturnValue(mockProc as unknown as cp.ChildProcess);

    await service.startIngestion(BASE_CONFIG);
    await service.stopIngestion(BASE_CONFIG.streamId);

    expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('stopIngestion() should throw NotFoundException when stream does not exist', async () => {
    await expect(service.stopIngestion('non-existent-uuid')).rejects.toThrow(NotFoundException);
  });

  it('should schedule reconnection and set status RECONNECTING when process exits with non-zero code', async () => {
    const mockProc = makeProcess();
    spawnMock.mockReturnValue(mockProc as unknown as cp.ChildProcess);

    await service.startIngestion(BASE_CONFIG);
    mockProc.emit('close', 1);

    const state = service.getStatus(BASE_CONFIG.streamId);
    expect(state.status).toBe(IngestionStatus.RECONNECTING);
    expect(state.reconnectAttempts).toBe(1);
  });

  it('should NOT reconnect if stopIngestion() was called before the process close event', async () => {
    const mockProc = makeProcess();
    spawnMock.mockReturnValue(mockProc as unknown as cp.ChildProcess);

    await service.startIngestion(BASE_CONFIG);
    await service.stopIngestion(BASE_CONFIG.streamId);

    mockProc.emit('close', 1);

    expect(() => service.getStatus(BASE_CONFIG.streamId)).toThrow(NotFoundException);
  });

  it('getSummary() should return correct counts for running and reconnecting statuses', async () => {
    const mockProc1 = makeProcess(1001);
    const mockProc2 = makeProcess(1002);

    spawnMock
      .mockReturnValueOnce(mockProc1 as unknown as cp.ChildProcess)
      .mockReturnValueOnce(mockProc2 as unknown as cp.ChildProcess);

    const config2 = {
      ...BASE_CONFIG,
      streamId: 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee',
      streamName: 'cam_exit',
    };

    await service.startIngestion(BASE_CONFIG);
    await service.startIngestion(config2);

    mockProc1.emit('close', 1);

    const summary = service.getSummary();
    expect(summary.total).toBe(2);
    expect(summary.running).toBe(1);
    expect(summary.reconnecting).toBe(1);
    expect(summary.error).toBe(0);
  });

  it('should use exponential backoff: second reconnect delay is exactly double the first (no jitter)', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);

    const capturedDelays: number[] = [];
    const mockProcs: ReturnType<typeof makeProcess>[] = [];

    spawnMock.mockImplementation(() => {
      const proc = makeProcess(2000 + mockProcs.length);
      mockProcs.push(proc);
      return proc as unknown as cp.ChildProcess;
    });

    jest.spyOn(global, 'setTimeout').mockImplementation(
      (fn: Parameters<typeof setTimeout>[0], ms?: number) => {
        capturedDelays.push(ms ?? 0);
        if (typeof fn === 'function') fn();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
    );

    const config = { ...BASE_CONFIG, reconnectDelayMs: 1000, maxReconnectAttempts: 5 };
    await service.startIngestion(config);

    // Attempt 1: delay = 1000 * 2^0 + 0 jitter = 1000
    mockProcs[0].emit('close', 1);
    // setTimeout fires immediately → spawnFFmpeg → mockProcs[1] created

    // Attempt 2: delay = 1000 * 2^1 + 0 jitter = 2000
    mockProcs[1].emit('close', 1);

    expect(capturedDelays).toHaveLength(2);
    expect(capturedDelays[0]).toBe(1000);
    expect(capturedDelays[1]).toBe(2000);
    expect(capturedDelays[1]).toBeGreaterThanOrEqual(capturedDelays[0] * 2);
  });
});
