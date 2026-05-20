import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosError, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { WowzaServer } from '../../wowza-servers/entities/wowza-server.entity';
import { RedisService } from '../redis/redis.service';
import { WowzaApplication } from './types/wowza-application.types';
import { WowzaConnection, WowzaConnectionSummary } from './types/wowza-connection.types';
import { WowzaPlaybackUrls, WowzaStream } from './types/wowza-stream.types';

interface WowzaServerConfig {
  id: string;
  ip: string;
  portApi: number;
  portStream: number;
  portHls: number;
  apiUser: string;
  apiPassword: string;
  appName: string;
}

@Injectable()
export class WowzaService {
  private readonly logger = new Logger(WowzaService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @InjectRepository(WowzaServer)
    private readonly wowzaServersRepo: Repository<WowzaServer>,
  ) {}

  // ── Resolución de servidor activo ─────────────────────────────────────────

  private async getActiveServer(serverId?: string): Promise<WowzaServerConfig> {
    try {
      let server: WowzaServer | null = null;

      if (serverId) {
        server = await this.wowzaServersRepo.findOne({
          where: { id: serverId, isActive: true },
        });
      }

      if (!server) {
        server = await this.wowzaServersRepo.findOne({
          where: { isDefault: true, isActive: true },
        });
      }

      if (!server) {
        server = await this.wowzaServersRepo.findOne({
          where: { isActive: true },
          order: { createdAt: 'ASC' },
        });
      }

      if (server) {
        return {
          id: server.id,
          ip: server.ip,
          portApi: server.portApi,
          portStream: server.portStream,
          portHls: server.portHls,
          apiUser: server.apiUser,
          apiPassword: server.apiPassword,
          appName: server.appName,
        };
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo resolver servidor Wowza en DB, usando config de entorno: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Fallback a variables de entorno para compatibilidad cuando no hay servidores en DB
    return {
      id: 'env',
      ip: this.configService.get<string>('wowza.host') ?? 'localhost',
      portApi: this.configService.get<number>('wowza.portApi') ?? 8087,
      portStream: this.configService.get<number>('wowza.portStream') ?? 1935,
      portHls: this.configService.get<number>('wowza.portHls') ?? 8088,
      apiUser: this.configService.get<string>('wowza.apiUser') ?? 'admin',
      apiPassword: this.configService.get<string>('wowza.apiPassword') ?? '',
      appName: this.configService.get<string>('wowza.appName') ?? 'live',
    };
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  private buildHeaders(server: WowzaServerConfig): Record<string, string> {
    const credentials = Buffer.from(`${server.apiUser}:${server.apiPassword}`).toString('base64');
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

  private async wowzaGet<T>(path: string, server: WowzaServerConfig): Promise<T> {
    const url = `http://${server.ip}:${server.portApi}/v2${path}`;
    this.logger.log(`GET ${url}`);
    try {
      const response: AxiosResponse<T> = await firstValueFrom(
        this.httpService.get<T>(url, { headers: this.buildHeaders(server) }),
      );
      return response.data;
    } catch (err) {
      return this.handleAxiosError(err, `GET ${path}`);
    }
  }

  private async wowzaPut(path: string, server: WowzaServerConfig, body: unknown = {}): Promise<void> {
    const url = `http://${server.ip}:${server.portApi}/v2${path}`;
    this.logger.log(`PUT ${url}`);
    try {
      await firstValueFrom(
        this.httpService.put(url, body, { headers: this.buildHeaders(server) }),
      );
    } catch (err) {
      this.handleAxiosError(err, `PUT ${path}`);
    }
  }

  // ── API pública ───────────────────────────────────────────────────────────

  async getApplications(serverId?: string): Promise<WowzaApplication[]> {
    const server = await this.getActiveServer(serverId);
    return this.redisService.getOrSet(`wowza:${server.id}:applications`, 30, async () => {
      const data = await this.wowzaGet<{ applications: WowzaApplication[] }>(
        '/servers/_defaultServer_/vhosts/_defaultVHost_/applications',
        server,
      );
      return data.applications ?? [];
    });
  }

  async getApplication(appName: string, serverId?: string): Promise<WowzaApplication> {
    const server = await this.getActiveServer(serverId);
    return this.wowzaGet<WowzaApplication>(
      `/servers/_defaultServer_/vhosts/_defaultVHost_/applications/${appName}`,
      server,
    );
  }

  async getIncomingStreams(appName: string, serverId?: string): Promise<WowzaStream[]> {
    const server = await this.getActiveServer(serverId);
    return this.redisService.getOrSet(`wowza:${server.id}:streams:${appName}`, 5, async () => {
      const data = await this.wowzaGet<{ incomingStreams: WowzaStream[] }>(
        `/servers/_defaultServer_/vhosts/_defaultVHost_/applications/${appName}/instances/_definst_/incomingstreams`,
        server,
      );
      return data.incomingStreams ?? [];
    });
  }

  async getIncomingStream(appName: string, streamName: string, serverId?: string): Promise<WowzaStream | null> {
    const server = await this.getActiveServer(serverId);
    try {
      return await this.wowzaGet<WowzaStream>(
        `/servers/_defaultServer_/vhosts/_defaultVHost_/applications/${appName}/instances/_definst_/incomingstreams/${streamName}`,
        server,
      );
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === 404) return null;
      throw err;
    }
  }

  async connectStream(appName: string, streamName: string, serverId?: string): Promise<void> {
    const server = await this.getActiveServer(serverId);
    await this.wowzaPut(
      `/servers/_defaultServer_/vhosts/_defaultVHost_/applications/${appName}/instances/_definst_/incomingstreams/${streamName}/actions/connect`,
      server,
    );
    await this.redisService.invalidate(`wowza:${server.id}:streams:${appName}`);
  }

  async disconnectStream(appName: string, streamName: string, serverId?: string): Promise<void> {
    const server = await this.getActiveServer(serverId);
    await this.wowzaPut(
      `/servers/_defaultServer_/vhosts/_defaultVHost_/applications/${appName}/instances/_definst_/incomingstreams/${streamName}/actions/disconnect`,
      server,
    );
    await this.redisService.invalidate(`wowza:${server.id}:streams:${appName}`);
  }

  async getConnections(serverId?: string): Promise<WowzaConnectionSummary> {
    const server = await this.getActiveServer(serverId);
    return this.redisService.getOrSet(`wowza:${server.id}:connections`, 10, async () => {
      const data = await this.wowzaGet<{ connections: WowzaConnection[] }>(
        '/servers/_defaultServer_/vhosts/_defaultVHost_/connections',
        server,
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

  async getServerStatus(serverId?: string): Promise<{ isOnline: boolean; version: string; uptime: number }> {
    const server = await this.getActiveServer(serverId);
    return this.redisService.getOrSet(`wowza:${server.id}:status`, 15, async () => {
      try {
        const data = await this.wowzaGet<{ serverVersion?: string; uptime?: number }>(
          '/servers/_defaultServer_',
          server,
        );
        return { isOnline: true, version: data.serverVersion ?? 'unknown', uptime: data.uptime ?? 0 };
      } catch {
        return { isOnline: false, version: 'unknown', uptime: 0 };
      }
    });
  }

  async buildPlaybackUrls(appName: string, streamName: string, serverId?: string): Promise<WowzaPlaybackUrls> {
    const server = await this.getActiveServer(serverId);
    const base = `http://${server.ip}:${server.portStream}/${appName}/${streamName}`;
    const webrtcPort = server.portHls + 2; // portHls(8088)+2 = 8090 (puerto WebRTC por defecto de Wowza)
    return {
      hls: `${base}/playlist.m3u8`,
      llHls: `${base}/playlist.m3u8?chunklist`,
      dash: `${base}/manifest.mpd`,
      webrtc: `https://${server.ip}:${webrtcPort}/webrtc/${appName}/${streamName}`,
      rtmp: `rtmp://${server.ip}:${server.portStream}/${appName}/${streamName}`,
    };
  }
}
