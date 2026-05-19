import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChildProcess, spawn } from 'child_process';
import { RTSPCameraConfig } from './types/ingestion-config.types';
import {
  IngestionProcessState,
  IngestionStatus,
  IngestionSummary,
} from './types/ingestion-status.types';

@Injectable()
export class IngestionService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(IngestionService.name);
  private readonly processes = new Map<string, ChildProcess>();
  private readonly states = new Map<string, IngestionProcessState>();
  private readonly configs = new Map<string, RTSPCameraConfig>();
  private ffmpegAvailable = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    void this.checkFFmpegAvailability();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stopAll();
  }

  private checkFFmpegAvailability(): Promise<void> {
    return new Promise<void>((resolve) => {
      const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
      proc.on('close', (code) => {
        this.ffmpegAvailable = code === 0;
        if (this.ffmpegAvailable) {
          this.logger.log('FFmpeg disponible');
        } else {
          this.logger.error('FFmpeg retornó código de error. Ingestión RTSP no disponible.');
        }
        resolve();
      });
      proc.on('error', () => {
        this.logger.error(
          'FFmpeg no encontrado o no ejecutable. Instale FFmpeg para usar la ingestión RTSP.',
        );
        this.ffmpegAvailable = false;
        resolve();
      });
    });
  }

  private sanitizeRtspUrl(url: string): string {
    return url.replace(/rtsp:\/\/([^:@]+):([^@]+)@/, 'rtsp://***:***@');
  }

  private validateExtraArgs(args: string[]): void {
    const dangerousPattern = /shell|exec|system/i;
    for (const arg of args) {
      if (arg.startsWith('-filter_complex') && dangerousPattern.test(arg)) {
        throw new BadRequestException(
          'Argumento ffmpegExtraArgs potencialmente inseguro detectado',
        );
      }
    }
  }

  private buildFfmpegArgs(config: RTSPCameraConfig): string[] {
    const wowzaHost = this.configService.get<string>('wowza.host') || 'localhost';
    const wowzaPort = this.configService.get<number>('wowza.streamPort') || 1935;
    const rtmpDest = `rtmp://${wowzaHost}:${wowzaPort}/${config.wowzaAppName}/${config.streamName}`;

    const args: string[] = ['-rtsp_transport', config.transport, '-i', config.rtspUrl, '-c:v', config.videoCodec];

    if (config.audioCodec === 'none') {
      args.push('-an');
    } else {
      args.push('-c:a', config.audioCodec);
    }

    args.push('-f', 'flv');

    if (config.ffmpegExtraArgs?.length) {
      args.push(...config.ffmpegExtraArgs);
    }

    args.push(rtmpDest);
    return args;
  }

  async startIngestion(config: RTSPCameraConfig): Promise<IngestionProcessState> {
    if (!this.ffmpegAvailable) {
      throw new ServiceUnavailableException(
        'FFmpeg no está disponible. Instale FFmpeg para usar la ingestión RTSP.',
      );
    }

    const existing = this.states.get(config.streamId);
    if (
      existing &&
      (existing.status === IngestionStatus.RUNNING ||
        existing.status === IngestionStatus.STARTING)
    ) {
      throw new ConflictException('Stream ya está siendo ingestado');
    }

    if (config.ffmpegExtraArgs?.length) {
      this.validateExtraArgs(config.ffmpegExtraArgs);
    }

    const args = this.buildFfmpegArgs(config);
    const sanitizedRtsp = this.sanitizeRtspUrl(config.rtspUrl);
    const sanitizedArgs = args.map((a) => (a === config.rtspUrl ? sanitizedRtsp : a));
    const ffmpegCommand = ['ffmpeg', ...sanitizedArgs].join(' ');

    const state: IngestionProcessState = {
      streamId: config.streamId,
      streamName: config.streamName,
      status: IngestionStatus.STARTING,
      reconnectAttempts: 0,
      ffmpegCommand,
    };

    this.states.set(config.streamId, state);
    this.configs.set(config.streamId, config);
    this.spawnFFmpeg(config, state);

    return state;
  }

  private spawnFFmpeg(config: RTSPCameraConfig, state: IngestionProcessState): void {
    const args = this.buildFfmpegArgs(config);

    const proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    this.processes.set(config.streamId, proc);
    state.status = IngestionStatus.RUNNING;
    state.pid = proc.pid;
    state.startedAt = new Date();

    proc.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (
        output.includes('Connection refused') ||
        output.includes('No route to host') ||
        output.includes('401 Unauthorized')
      ) {
        state.lastError = output.trim().slice(0, 256);
        state.lastErrorAt = new Date();
      }
      this.logger.debug(`[${config.streamName}] ${output.trim().slice(0, 200)}`);
    });

    proc.on('error', (err) => {
      this.logger.error(`FFmpeg no encontrado o no ejecutable: ${err.message}`);
      state.status = IngestionStatus.ERROR;
      state.lastError = err.message;
      state.lastErrorAt = new Date();
      this.processes.delete(config.streamId);
    });

    proc.on('close', (code) => {
      if (!this.processes.has(config.streamId)) return;

      if (code !== 0 && code !== null) {
        this.logger.warn(
          `Stream ${config.streamName} terminó con código ${code}. Programando reconexión.`,
        );
        this.scheduleReconnect(config, state);
      }
    });
  }

  private scheduleReconnect(config: RTSPCameraConfig, state: IngestionProcessState): void {
    state.reconnectAttempts++;

    const maxAttempts = config.maxReconnectAttempts ?? 10;
    if (maxAttempts > 0 && state.reconnectAttempts > maxAttempts) {
      state.status = IngestionStatus.MAX_RETRIES;
      this.logger.warn(
        `Stream ${config.streamName}: máximo de reconexiones alcanzado (${maxAttempts})`,
      );
      this.processes.delete(config.streamId);
      return;
    }

    const baseDelay = config.reconnectDelayMs ?? 3000;
    const delay = Math.min(baseDelay * Math.pow(2, state.reconnectAttempts - 1), 60_000);
    const jitter = Math.random() * 1000;
    const totalDelay = delay + jitter;

    state.status = IngestionStatus.RECONNECTING;
    this.logger.log(
      `Reconectando ${config.streamName} en ${Math.round(totalDelay)}ms (intento ${state.reconnectAttempts})`,
    );

    setTimeout(() => {
      if (!this.processes.has(config.streamId)) return;
      this.spawnFFmpeg(config, state);
    }, totalDelay);
  }

  async stopIngestion(streamId: string): Promise<void> {
    const proc = this.processes.get(streamId);
    if (!proc) {
      throw new NotFoundException(`Stream ${streamId} no está siendo ingestado`);
    }

    const state = this.states.get(streamId)!;
    const streamName = state.streamName;

    // Remove from maps BEFORE killing so the 'close' handler does not trigger reconnect
    this.processes.delete(streamId);
    this.states.delete(streamId);
    this.configs.delete(streamId);

    proc.kill('SIGTERM');

    setTimeout(() => {
      try {
        if (proc.pid !== undefined) {
          process.kill(proc.pid, 0);
          proc.kill('SIGKILL');
        }
      } catch {
        /* process already dead */
      }
    }, 3000);

    state.status = IngestionStatus.STOPPED;
    this.logger.log(`Stream ${streamName} detenido`);
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.processes.keys());
    await Promise.all(ids.map((id) => this.stopIngestion(id).catch(() => {})));
  }

  async restartIngestion(streamId: string): Promise<IngestionProcessState> {
    const config = this.configs.get(streamId);
    if (!config) {
      throw new NotFoundException(`Stream ${streamId} no encontrado`);
    }
    await this.stopIngestion(streamId);
    return this.startIngestion(config);
  }

  getStatus(streamId: string): IngestionProcessState {
    const state = this.states.get(streamId);
    if (!state) {
      throw new NotFoundException(`Stream ${streamId} no encontrado`);
    }
    return state;
  }

  getSummary(): IngestionSummary {
    const all = Array.from(this.states.values());
    return {
      total: all.length,
      running: all.filter((s) => s.status === IngestionStatus.RUNNING).length,
      reconnecting: all.filter((s) => s.status === IngestionStatus.RECONNECTING).length,
      error: all.filter(
        (s) => s.status === IngestionStatus.ERROR || s.status === IngestionStatus.MAX_RETRIES,
      ).length,
      processes: all,
    };
  }

  isRunning(streamId: string): boolean {
    const state = this.states.get(streamId);
    return (
      !!state &&
      (state.status === IngestionStatus.RUNNING || state.status === IngestionStatus.RECONNECTING)
    );
  }
}
