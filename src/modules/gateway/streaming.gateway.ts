import { createHash } from 'crypto';
import { forwardRef, Inject, Logger, OnApplicationShutdown, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { StreamsService } from '../streams/streams.service';
import { StreamStatus } from '../streams/entities/stream.entity';
import { WowzaService } from '../wowza/wowza.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { IngestionStatus } from '../ingestion/types/ingestion-status.types';
import { RedisService } from '../redis/redis.service';
import { GatewayAuthGuard } from './gateway-auth.guard';
import { ClientToServerEvents, ServerToClientEvents } from './types/socket-events.types';
import {
  AlertPayload,
  IngestionStatusPayload,
  ServerStatusPayload,
} from './types/socket-payload.types';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
}

interface ConnectedClient {
  userId: string;
  email: string;
  role: string;
  connectedAt: Date;
  subscribedStreams: Set<string>;
}

@SkipThrottle()
@WebSocketGateway({
  namespace: '/monitoring',
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
  transports: ['websocket', 'polling'],
})
@UseGuards(GatewayAuthGuard)
export class StreamingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnApplicationShutdown
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(StreamingGateway.name);
  private readonly connectedClients = new Map<string, ConnectedClient>();
  private readonly lastKnownStatus = new Map<string, string>();
  private readonly lastKnownIngestionStatus = new Map<string, string>();
  private pollingInterval: NodeJS.Timeout | null = null;
  private pollTickCounter = 0;

  constructor(
    @Inject(forwardRef(() => StreamsService))
    private readonly streamsService: StreamsService,
    private readonly wowzaService: WowzaService,
    private readonly ingestionService: IngestionService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  afterInit(_server: Server): void {
    this.logger.log('WebSocket Gateway /monitoring inicializado');
    this.startPolling();
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      await this.validateHandshake(client);
    } catch {
      client.disconnect(true);
      return;
    }

    const user = client.data.user as { userId: string; email: string; role: string };
    this.connectedClients.set(client.id, {
      userId: user.userId,
      email: user.email,
      role: user.role,
      connectedAt: new Date(),
      subscribedStreams: new Set(),
    });

    void client.join('all');
    this.logger.log(`Cliente conectado: ${client.id} | user: ${user.email}`);

    try {
      const statusPayload = await this.buildServerStatusPayload();
      client.emit(ServerToClientEvents.SERVER_STATUS, statusPayload);
    } catch {
      // best-effort
    }
  }

  handleDisconnect(client: Socket): void {
    this.connectedClients.delete(client.id);
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage(ClientToServerEvents.SUBSCRIBE_STREAM)
  async handleSubscribeStream(
    client: Socket,
    streamId: string,
  ): Promise<{ subscribed: boolean; streamId: string }> {
    void client.join(`stream:${streamId}`);
    const clientData = this.connectedClients.get(client.id);
    if (clientData) clientData.subscribedStreams.add(streamId);

    try {
      const current = await this.streamsService.findOne(streamId);
      client.emit(ServerToClientEvents.STREAM_STATUS_CHANGED, {
        streamId,
        streamName: current.wowzaStreamName,
        previousStatus: current.status,
        currentStatus: current.status,
        isLiveInWowza: current.isLiveInWowza,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // stream may not exist yet
    }

    return { subscribed: true, streamId };
  }

  @SubscribeMessage(ClientToServerEvents.UNSUBSCRIBE_STREAM)
  async handleUnsubscribeStream(
    client: Socket,
    streamId: string,
  ): Promise<{ unsubscribed: boolean; streamId: string }> {
    void client.leave(`stream:${streamId}`);
    const clientData = this.connectedClients.get(client.id);
    if (clientData) clientData.subscribedStreams.delete(streamId);
    return { unsubscribed: true, streamId };
  }

  @SubscribeMessage(ClientToServerEvents.SUBSCRIBE_ALL_STREAMS)
  async handleSubscribeAll(
    client: Socket,
  ): Promise<{ subscribed: boolean; monitoredStreamIds: string[] }> {
    void client.join('all_streams');
    return { subscribed: true, monitoredStreamIds: Array.from(this.lastKnownStatus.keys()) };
  }

  @SubscribeMessage(ClientToServerEvents.REQUEST_STATUS)
  async handleRequestStatus(_client: Socket): Promise<ServerStatusPayload> {
    return this.buildServerStatusPayload();
  }

  // ─── Public emit methods ───────────────────────────────────────────────────

  emitStreamEvent(event: string, streamId: string, payload: unknown): void {
    this.server.to(`stream:${streamId}`).emit(event, payload);
    this.server.to('all_streams').emit(event, payload);
  }

  emitAlert(payload: AlertPayload): void {
    this.server.to('all').emit(ServerToClientEvents.ALERT_NEW, payload);
  }

  emitIngestionStatus(streamId: string, payload: IngestionStatusPayload): void {
    let event: string;
    switch (payload.status) {
      case IngestionStatus.STARTING:
      case IngestionStatus.RUNNING:
        event = ServerToClientEvents.INGESTION_STARTED;
        break;
      case IngestionStatus.RECONNECTING:
        event = ServerToClientEvents.INGESTION_RECONNECTING;
        break;
      case IngestionStatus.MAX_RETRIES:
        event = ServerToClientEvents.INGESTION_MAX_RETRIES;
        break;
      default:
        event = ServerToClientEvents.INGESTION_STOPPED;
    }
    this.server.to(`stream:${streamId}`).emit(event, payload);
  }

  emitEvidenceCreated(evidence: Record<string, unknown>): void {
    const { storagePath: _, storage_path: __, ...safe } = evidence;
    this.server.to('all').emit(ServerToClientEvents.EVIDENCE_CREATED, safe);
  }

  // ─── Polling ───────────────────────────────────────────────────────────────

  private startPolling(): void {
    this.pollingInterval = setInterval(() => {
      void this.pollWowzaStatus();
    }, 10_000);
  }

  private async pollWowzaStatus(): Promise<void> {
    if (this.connectedClients.size === 0) return;

    this.pollTickCounter++;

    try {
      const { data: streams } = await this.streamsService.findAll({}, { limit: 1000 });

      await Promise.allSettled(
        streams.map(async (stream) => {
          try {
            const updated = await this.streamsService.syncStatusFromWowza(stream.id);
            const previous = this.lastKnownStatus.get(stream.id);

            if (previous !== undefined && previous !== updated.status) {
              const payload = {
                streamId: stream.id,
                streamName: stream.wowzaStreamName,
                previousStatus: previous,
                currentStatus: updated.status,
                isLiveInWowza: updated.isLiveInWowza,
                timestamp: new Date().toISOString(),
              };
              this.server
                .to(`stream:${stream.id}`)
                .emit(ServerToClientEvents.STREAM_STATUS_CHANGED, payload);
              this.server
                .to('all_streams')
                .emit(ServerToClientEvents.STREAM_STATUS_CHANGED, payload);
            }

            this.lastKnownStatus.set(stream.id, updated.status);

            if (this.ingestionService.isRunning(stream.id)) {
              try {
                const state = this.ingestionService.getStatus(stream.id);
                const prevIngestion = this.lastKnownIngestionStatus.get(stream.id);
                if (prevIngestion !== state.status) {
                  this.emitIngestionStatus(stream.id, {
                    streamId: stream.id,
                    streamName: stream.wowzaStreamName,
                    status: state.status,
                    reconnectAttempts: state.reconnectAttempts,
                    lastError: state.lastError,
                    timestamp: new Date().toISOString(),
                  });
                  this.lastKnownIngestionStatus.set(stream.id, state.status);
                }
              } catch {
                // getStatus may throw if process terminated between checks
              }
            } else {
              this.lastKnownIngestionStatus.delete(stream.id);
            }
          } catch {
            // individual stream failure — continue with others
          }
        }),
      );

      if (this.pollTickCounter % 3 === 0) {
        const serverStatus = await this.buildServerStatusPayload();
        this.server.to('all').emit(ServerToClientEvents.SERVER_STATUS, serverStatus);
      }
    } catch {
      // polling must never crash the process
    }
  }

  private async buildServerStatusPayload(): Promise<ServerStatusPayload> {
    let wowzaOnline = false;
    let wowzaVersion: string | undefined;
    try {
      const status = await this.wowzaService.getServerStatus();
      wowzaOnline = status.isOnline;
      wowzaVersion = status.version;
    } catch {
      // Wowza offline
    }

    let totalStreams = 0;
    let activeStreams = 0;
    try {
      const [allResult, activeResult] = await Promise.allSettled([
        this.streamsService.findAll({}, { page: 1, limit: 1 }),
        this.streamsService.findAll({ status: StreamStatus.ACTIVE }, { page: 1, limit: 1 }),
      ]);
      if (allResult.status === 'fulfilled') totalStreams = allResult.value.meta.total;
      if (activeResult.status === 'fulfilled') activeStreams = activeResult.value.meta.total;
    } catch {
      // ignore
    }

    return {
      wowzaOnline,
      wowzaVersion,
      totalStreams,
      activeStreams,
      totalConnections: 0,
      connectedClients: this.connectedClients.size,
      timestamp: new Date().toISOString(),
    };
  }

  private async validateHandshake(client: Socket): Promise<void> {
    const authToken = client.handshake?.auth?.token as string | undefined;
    if (!authToken) throw new WsException('Unauthorized');

    const token = authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;

    const secret = this.configService.get<string>('jwt.secret') ?? 'jwt_secret';
    const payload = this.jwtService.verify<JwtPayload>(token, { secret });

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const isBlacklisted = await this.redisService.exists(`blacklist:${tokenHash}`);
    if (isBlacklisted) throw new WsException('Token revocado');

    client.data.user = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId,
    };
  }

  onApplicationShutdown(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}
