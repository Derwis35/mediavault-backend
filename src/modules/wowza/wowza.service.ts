import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../redis/redis.service';
import { WowzaApplication } from './types/wowza-application.types';
import { WowzaConnection, WowzaConnectionSummary } from './types/wowza-connection.types';
import { WowzaPlaybackUrls, WowzaStream } from './types/wowza-stream.types';

@Injectable()
export class WowzaService {
  private readonly logger = new Logger(WowzaService.name);
  private readonly baseUrl: string;
  private readonly streamHost: string;
  private readonly streamPort: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const host = this.configService.get<string>('wowza.host') || 'localhost';
    const port = this.configService.get<number>('wowza.port') || 8087;
    this.baseUrl = `http://${host}:${port}/v2`;
    this.streamHost = host;
    this.streamPort = this.configService.get<number>('wowza.streamPort') || 1935;
  }

  private buildHeaders(): Record<string, string> {
    const user = this.configService.get<string>('wowza.user') || 'admin';
    const password = this.configService.get<string>('wowza.password') || '';
    const credentials = Buffer.from(`${user}:${password}`).toString('base64');
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    };
  }

  private handleAxiosError(err: unknown, context: string): never {
    const isAxiosErr =
      err != null &&
      typeof err === 'object' &&
      'isAxiosError' in err &&
      (err as { isAxiosError: unknown }).isAxiosError === true;

    if (isAxiosErr) {
      const axiosErr = err as AxiosError;
      if (
        axiosErr.code === 'ECONNREFUSED' ||
        axiosErr.code === 'ETIMEDOUT' ||
        axiosErr.code === 'ENOTFOUND'
      ) {
        throw new ServiceUnavailableException('Wowza Streaming Engine no disponible');
      }
      if (axiosErr.response) {
        throw new HttpException(
          (axiosErr.response.data as string) || `Error de Wowza: ${context}`,
          axiosErr.response.status,
        );
      }
    }
    throw new ServiceUnavailableException('Wowza Streaming Engine no disponible');
  }

  private async wowzaGet<T>(path: string): Promise<T> {
    this.logger.log(`GET /v2${path}`);
    try {
      const response: AxiosResponse<T> = await firstValueFrom(
        this.httpService.get<T>(`${this.baseUrl}${path}`, { headers: this.buildHeaders() }),
      );
      return response.data;
    } catch (err) {
      return this.handleAxiosError(err, `GET ${path}`);
    }
  }

  private async wowzaPut(path: string, body: unknown = {}): Promise<void> {
    this.logger.log(`PUT /v2${path}`);
    try {
      await firstValueFrom(
        this.httpService.put(`${this.baseUrl}${path}`, body, { headers: this.buildHeaders() }),
      );
    } catch (err) {
      this.handleAxiosError(err, `PUT ${path}`);
    }
  }

  async getApplications(): Promise<WowzaApplication[]> {
    return this.redisService.getOrSet('wowza:applications', 30, async () => {
      const data = await this.wowzaGet<{ applications: WowzaApplication[] }>(
        '/servers/_defaultServer_/vhosts/_defaultVHost_/applications',
      );
      return data.applications ?? [];
    });
  }

  async getApplication(appName: string): Promise<WowzaApplication> {
    return this.wowzaGet<WowzaApplication>(
      `/servers/_defaultServer_/vhosts/_defaultVHost_/applications/${appName}`,
    );
  }

  async getIncomingStreams(appName: string): Promise<WowzaStream[]> {
    return this.redisService.getOrSet(`wowza:streams:${appName}`, 5, async () => {
      const data = await this.wowzaGet<{ incomingStreams: WowzaStream[] }>(
        `/servers/_defaultServer_/vhosts/_defaultVHost_/applications/${appName}/instances/_definst_/incomingstreams`,
      );
      return data.incomingStreams ?? [];
    });
  }

  async getIncomingStream(appName: string, streamName: string): Promise<WowzaStream | null> {
    try {
      return await this.wowzaGet<WowzaStream>(
        `/servers/_defaultServer_/vhosts/_defaultVHost_/applications/${appName}/instances/_definst_/incomingstreams/${streamName}`,
      );
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === 404) {
        return null;
      }
      throw err;
    }
  }

  async connectStream(appName: string, streamName: string): Promise<void> {
    await this.wowzaPut(
      `/servers/_defaultServer_/vhosts/_defaultVHost_/applications/${appName}/instances/_definst_/incomingstreams/${streamName}/actions/connect`,
    );
    await this.redisService.invalidate(`wowza:streams:${appName}`);
  }

  async disconnectStream(appName: string, streamName: string): Promise<void> {
    await this.wowzaPut(
      `/servers/_defaultServer_/vhosts/_defaultVHost_/applications/${appName}/instances/_definst_/incomingstreams/${streamName}/actions/disconnect`,
    );
    await this.redisService.invalidate(`wowza:streams:${appName}`);
  }

  async getConnections(): Promise<WowzaConnectionSummary> {
    return this.redisService.getOrSet('wowza:connections', 10, async () => {
      const data = await this.wowzaGet<{ connections: WowzaConnection[] }>(
        '/servers/_defaultServer_/vhosts/_defaultVHost_/connections',
      );
      const connections = data.connections ?? [];
      const byApplication: Record<string, number> = {};
      const byProtocol: Record<string, number> = {};
      for (const conn of connections) {
        byApplication[conn.applicationName] = (byApplication[conn.applicationName] ?? 0) + 1;
        byProtocol[conn.protocol] = (byProtocol[conn.protocol] ?? 0) + 1;
      }
      return { total: connections.length, byApplication, byProtocol, connections };
    });
  }

  async getServerStatus(): Promise<{ isOnline: boolean; version: string; uptime: number }> {
    return this.redisService.getOrSet('wowza:status', 15, async () => {
      try {
        const data = await this.wowzaGet<{ serverVersion?: string; uptime?: number }>(
          '/servers/_defaultServer_',
        );
        return {
          isOnline: true,
          version: data.serverVersion ?? 'unknown',
          uptime: data.uptime ?? 0,
        };
      } catch {
        return { isOnline: false, version: 'unknown', uptime: 0 };
      }
    });
  }

  buildPlaybackUrls(appName: string, streamName: string): WowzaPlaybackUrls {
    const base = `http://${this.streamHost}:${this.streamPort}/${appName}/${streamName}`;
    return {
      hls: `${base}/playlist.m3u8`,
      llHls: `${base}/playlist.m3u8?chunklist`,
      dash: `${base}/manifest.mpd`,
      webrtc: `https://${this.streamHost}:8090/webrtc/${appName}/${streamName}`,
      rtmp: `rtmp://${this.streamHost}:${this.streamPort}/${appName}/${streamName}`,
    };
  }
}
