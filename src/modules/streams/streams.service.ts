import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stream, StreamProtocol, StreamStatus } from './entities/stream.entity';
import { CreateStreamDto } from './dto/create-stream.dto';
import { UpdateStreamDto } from './dto/update-stream.dto';
import { StreamResponseDto } from './dto/stream-response.dto';
import { PaginatedResponse } from './dto/paginated-streams.dto';
import { WowzaService } from '../wowza/wowza.service';
import { WowzaSecureToken } from '../wowza/types/wowza-secure-token.types';
import { WowzaSecureTokenService } from '../wowza/wowza-secure-token.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { IngestionProcessState, IngestionStatus } from '../ingestion/types/ingestion-status.types';
import {
  AudioCodecStrategy,
  RTSPCameraConfig,
  StreamTransportProtocol,
  VideoCodecStrategy,
} from '../ingestion/types/ingestion-config.types';
import { AuditService } from '../audit/audit.service';
import { StreamingGateway } from '../gateway/streaming.gateway';
import { AlertPayload } from '../gateway/types/socket-payload.types';

@Injectable()
export class StreamsService {
  private readonly logger = new Logger(StreamsService.name);

  constructor(
    @InjectRepository(Stream)
    private readonly streamRepository: Repository<Stream>,
    private readonly wowzaService: WowzaService,
    private readonly wowzaSecureTokenService: WowzaSecureTokenService,
    private readonly ingestionService: IngestionService,
    private readonly auditService: AuditService,
    @Optional() @Inject(forwardRef(() => StreamingGateway))
    private readonly gateway?: StreamingGateway,
  ) {}

  async create(dto: CreateStreamDto, userId: string): Promise<StreamResponseDto> {
    const existing = await this.streamRepository.findOne({
      where: { wowzaAppName: dto.wowzaAppName, wowzaStreamName: dto.wowzaStreamName },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un stream con la aplicación '${dto.wowzaAppName}' y nombre '${dto.wowzaStreamName}'`,
      );
    }

    const stream = this.streamRepository.create({
      name: dto.name,
      description: dto.description,
      wowzaAppName: dto.wowzaAppName,
      wowzaStreamName: dto.wowzaStreamName,
      sourceUrl: dto.sourceUrl,
      protocol: dto.protocol,
      location: dto.location,
      metadata: dto.metadata,
      status: StreamStatus.INACTIVE,
      createdBy: { id: userId } as unknown as Stream['createdBy'],
    });

    const saved = await this.streamRepository.save(stream);

    await this.auditService.logAction('STREAM_CREATED', 'Stream', saved.id, userId);

    const response = this.toResponseDto(saved);
    response.playbackUrls = this.wowzaService.buildPlaybackUrls(
      saved.wowzaAppName,
      saved.wowzaStreamName,
    );
    return response;
  }

  async findAll(
    filters: {
      status?: StreamStatus;
      protocol?: StreamProtocol;
      location?: string;
      search?: string;
      wowzaAppName?: string;
    },
    pagination: { page?: number; limit?: number },
  ): Promise<PaginatedResponse<StreamResponseDto>> {
    const page = Math.max(1, pagination.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.streamRepository
      .createQueryBuilder('stream')
      .leftJoinAndSelect('stream.createdBy', 'createdBy')
      .skip(skip)
      .take(limit);

    if (filters.status) {
      qb.andWhere('stream.status = :status', { status: filters.status });
    }
    if (filters.protocol) {
      qb.andWhere('stream.protocol = :protocol', { protocol: filters.protocol });
    }
    if (filters.location) {
      qb.andWhere('stream.location ILIKE :location', { location: `%${filters.location}%` });
    }
    if (filters.search) {
      qb.andWhere('(stream.name ILIKE :search OR stream.description ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    }
    if (filters.wowzaAppName) {
      qb.andWhere('stream.wowzaAppName = :wowzaAppName', { wowzaAppName: filters.wowzaAppName });
    }

    const [streams, total] = await qb.getManyAndCount();

    const data = await Promise.all(streams.map((s) => this.enrichStreamForList(s)));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string): Promise<StreamResponseDto> {
    const stream = await this.streamRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });
    if (!stream) {
      throw new NotFoundException(`Stream ${id} no encontrado`);
    }

    const dto = this.toResponseDto(stream);
    dto.playbackUrls = this.wowzaService.buildPlaybackUrls(
      stream.wowzaAppName,
      stream.wowzaStreamName,
    );

    const [wowzaResult, connectionsResult] = await Promise.allSettled([
      this.wowzaService.getIncomingStream(stream.wowzaAppName, stream.wowzaStreamName),
      this.wowzaService.getConnections(),
    ]);

    const isIngestionRunning = this.ingestionService.isRunning(stream.id);
    const wowzaActive =
      wowzaResult.status === 'fulfilled' && wowzaResult.value?.isConnected === true;

    dto.isLiveInWowza = isIngestionRunning || wowzaActive;

    if (connectionsResult.status === 'fulfilled') {
      dto.activeConnections =
        connectionsResult.value.byApplication[stream.wowzaAppName] ?? 0;
    }

    try {
      dto.ingestionStatus = this.ingestionService.getStatus(stream.id).status;
    } catch {
      dto.ingestionStatus = undefined;
    }

    return dto;
  }

  async update(id: string, dto: UpdateStreamDto, userId: string): Promise<StreamResponseDto> {
    const stream = await this.streamRepository.findOne({ where: { id } });
    if (!stream) {
      throw new NotFoundException(`Stream ${id} no encontrado`);
    }

    if (
      stream.status === StreamStatus.ACTIVE ||
      stream.status === StreamStatus.CONNECTING ||
      this.ingestionService.isRunning(id)
    ) {
      throw new ConflictException(
        'No se puede modificar un stream activo. Detenerlo primero.',
      );
    }

    Object.assign(stream, dto);
    const saved = await this.streamRepository.save(stream);

    await this.auditService.logAction('STREAM_UPDATED', 'Stream', id, userId);

    const response = this.toResponseDto(saved);
    response.playbackUrls = this.wowzaService.buildPlaybackUrls(
      saved.wowzaAppName,
      saved.wowzaStreamName,
    );
    return response;
  }

  async remove(id: string, userId: string): Promise<void> {
    const stream = await this.streamRepository.findOne({ where: { id } });
    if (!stream) {
      throw new NotFoundException(`Stream ${id} no encontrado`);
    }

    if (this.ingestionService.isRunning(id)) {
      await this.ingestionService.stopIngestion(id);
    }

    await this.streamRepository.softDelete(id);
    await this.auditService.logAction('STREAM_DELETED', 'Stream', id, userId);
  }

  async startIngestion(id: string, userId: string): Promise<IngestionProcessState> {
    const stream = await this.streamRepository.findOne({ where: { id } });
    if (!stream) {
      throw new NotFoundException(`Stream ${id} no encontrado`);
    }

    if (stream.protocol !== StreamProtocol.RTSP) {
      throw new BadRequestException(
        'Solo streams RTSP requieren ingesta FFmpeg. Los streams RTMP hacen push directo a Wowza.',
      );
    }

    if (!stream.sourceUrl) {
      throw new BadRequestException(
        'El stream no tiene sourceUrl configurada. Es requerida para ingestión RTSP.',
      );
    }

    const config: RTSPCameraConfig = {
      streamId: stream.id,
      streamName: stream.wowzaStreamName,
      rtspUrl: stream.sourceUrl,
      wowzaAppName: stream.wowzaAppName,
      transport: StreamTransportProtocol.TCP,
      videoCodec: VideoCodecStrategy.COPY,
      audioCodec: AudioCodecStrategy.AAC,
    };

    const state = await this.ingestionService.startIngestion(config);

    stream.status = StreamStatus.CONNECTING;
    await this.streamRepository.save(stream);

    await this.auditService.logAction('INGESTION_STARTED', 'Stream', id, userId);

    this.gateway?.emitIngestionStatus(id, {
      streamId: id,
      streamName: stream.wowzaStreamName,
      status: IngestionStatus.STARTING,
      reconnectAttempts: 0,
      timestamp: new Date().toISOString(),
    });

    return state;
  }

  async stopIngestion(id: string, userId: string): Promise<void> {
    await this.ingestionService.stopIngestion(id);

    const stream = await this.streamRepository.findOne({ where: { id } });
    if (stream) {
      stream.status = StreamStatus.INACTIVE;
      await this.streamRepository.save(stream);
      this.gateway?.emitIngestionStatus(id, {
        streamId: id,
        streamName: stream.wowzaStreamName,
        status: IngestionStatus.STOPPED,
        reconnectAttempts: 0,
        timestamp: new Date().toISOString(),
      });
    }

    await this.auditService.logAction('INGESTION_STOPPED', 'Stream', id, userId);
  }

  async getPlaybackUrl(
    id: string,
    sessionId: string,
    clientIp: string,
  ): Promise<WowzaSecureToken> {
    const stream = await this.streamRepository.findOne({ where: { id } });
    if (!stream) {
      throw new NotFoundException(`Stream ${id} no encontrado`);
    }

    const token = await this.wowzaSecureTokenService.generateSecureToken(
      {
        streamName: stream.wowzaStreamName,
        appName: stream.wowzaAppName,
        clientIp,
        ttlSeconds: 1800,
      },
      sessionId,
      id,
    );

    await this.auditService.logAction(
      'PLAYBACK_URL_REQUESTED',
      'Stream',
      id,
      undefined,
      undefined,
      { streamId: id, protocol: stream.protocol },
    );

    return token;
  }

  async syncStatusFromWowza(id: string): Promise<StreamResponseDto> {
    const stream = await this.streamRepository.findOne({ where: { id } });
    if (!stream) {
      throw new NotFoundException(`Stream ${id} no encontrado`);
    }

    const wowzaStream = await this.wowzaService.getIncomingStream(
      stream.wowzaAppName,
      stream.wowzaStreamName,
    );

    if (wowzaStream?.isConnected) {
      stream.status = StreamStatus.ACTIVE;
    } else {
      const isReconnecting = (() => {
        try {
          return this.ingestionService.getStatus(stream.id).status === IngestionStatus.RECONNECTING;
        } catch {
          return false;
        }
      })();
      stream.status = isReconnecting ? StreamStatus.CONNECTING : StreamStatus.INACTIVE;
    }

    const saved = await this.streamRepository.save(stream);
    return this.toResponseDto(saved);
  }

  async getIngestionStatus(id: string): Promise<IngestionProcessState> {
    return this.ingestionService.getStatus(id);
  }

  private async enrichStreamForList(stream: Stream): Promise<StreamResponseDto> {
    const dto = this.toResponseDto(stream);
    dto.playbackUrls = this.wowzaService.buildPlaybackUrls(
      stream.wowzaAppName,
      stream.wowzaStreamName,
    );

    const [wowzaResult] = await Promise.allSettled([
      this.wowzaService.getIncomingStream(stream.wowzaAppName, stream.wowzaStreamName),
    ]);

    const isIngestionRunning = this.ingestionService.isRunning(stream.id);
    const wowzaActive =
      wowzaResult.status === 'fulfilled' && wowzaResult.value?.isConnected === true;

    dto.isLiveInWowza = isIngestionRunning || wowzaActive;

    try {
      dto.ingestionStatus = this.ingestionService.getStatus(stream.id).status;
    } catch {
      dto.ingestionStatus = undefined;
    }

    return dto;
  }

  private emitAlert(
    level: AlertPayload['level'],
    title: string,
    message: string,
    streamId?: string,
  ): void {
    this.gateway?.emitAlert({
      id: crypto.randomUUID(),
      level,
      category: 'stream',
      title,
      message,
      streamId,
      timestamp: new Date().toISOString(),
    });
  }

  private toResponseDto(stream: Stream): StreamResponseDto {
    const dto = new StreamResponseDto();
    dto.id = stream.id;
    dto.name = stream.name;
    dto.description = stream.description;
    dto.wowzaAppName = stream.wowzaAppName;
    dto.wowzaStreamName = stream.wowzaStreamName;
    dto.sourceUrl = stream.sourceUrl;
    dto.protocol = stream.protocol;
    dto.status = stream.status;
    dto.location = stream.location;
    dto.metadata = stream.metadata;
    dto.createdAt = stream.createdAt;
    dto.updatedAt = stream.updatedAt;
    dto.isLiveInWowza = false;
    return dto;
  }
}
