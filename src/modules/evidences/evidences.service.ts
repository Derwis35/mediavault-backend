import * as crypto from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Evidence, EvidenceType } from './entities/evidence.entity';
import { Stream } from '../streams/entities/stream.entity';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { CreateEvidenceDto } from './dto/create-evidence.dto';
import { EvidenceFiltersDto } from './dto/evidence-filters.dto';
import {
  EvidenceResponseDto,
  IntegrityVerificationResult,
  PaginatedEvidencesResponse,
  SnapshotCreateDto,
} from './dto/evidence-response.dto';
import { EvidencesStorageService } from './evidences-storage.service';
import { EvidencesIntegrityService } from './evidences-integrity.service';
import { EvidencesExportService } from './evidences-export.service';
import { AuditService } from '../audit/audit.service';
import { StreamingGateway } from '../gateway/streaming.gateway';
import { WowzaService } from '../wowza/wowza.service';
import { CreateDvrClipDto } from './dto/create-dvr-clip.dto';

const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function isValidImageBuffer(buffer: Buffer): boolean {
  const isPng = PNG_MAGIC.every((byte, i) => buffer[i] === byte);
  const isJpeg = JPEG_MAGIC.every((byte, i) => buffer[i] === byte);
  return isPng || isJpeg;
}

@Injectable()
export class EvidencesService {
  private readonly logger = new Logger(EvidencesService.name);

  constructor(
    @InjectRepository(Evidence)
    private readonly evidenceRepository: Repository<Evidence>,
    @InjectRepository(Stream)
    private readonly streamRepository: Repository<Stream>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly storageService: EvidencesStorageService,
    private readonly integrityService: EvidencesIntegrityService,
    private readonly exportService: EvidencesExportService,
    private readonly auditService: AuditService,
    private readonly gateway: StreamingGateway,
    private readonly wowzaService: WowzaService,
  ) {}

  async create(
    file: Express.Multer.File,
    dto: CreateEvidenceDto,
    userId: string,
    userIp: string,
  ): Promise<EvidenceResponseDto> {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo');
    }

    let stream: Stream | undefined;
    if (dto.streamId) {
      const found = await this.streamRepository.findOne({ where: { id: dto.streamId } });
      if (!found) throw new NotFoundException(`Stream ${dto.streamId} no encontrado`);
      stream = found;
    }

    let event: Event | undefined;
    if (dto.eventId) {
      const found = await this.eventRepository.findOne({ where: { id: dto.eventId } });
      if (!found) throw new NotFoundException(`Event ${dto.eventId} no encontrado`);
      event = found;
    }

    const hash = this.integrityService.computeHashFromBuffer(file.buffer);

    const evidenceId = crypto.randomUUID();
    const { path: storagePath, sizeBytes } = await this.storageService.saveFile(
      file,
      evidenceId,
      dto.type,
    );

    const evidence = this.evidenceRepository.create({
      id: evidenceId,
      type: dto.type,
      storagePath,
      hashSha256: hash,
      fileSizeBytes: String(sizeBytes),
      durationSeconds: dto.metadata?.duration as number | undefined,
      metadata: dto.metadata,
      recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : undefined,
      stream: stream ? ({ id: stream.id } as Stream) : undefined,
      event: event ? ({ id: event.id } as Event) : undefined,
      uploadedBy: { id: userId } as User,
    });

    const saved = await this.evidenceRepository.save(evidence);

    await this.auditService.logAction(
      'EVIDENCE_CREATED',
      'Evidence',
      saved.id,
      userId,
      userIp,
      { type: dto.type, streamId: dto.streamId, hash },
    );

    this.gateway.emitEvidenceCreated(saved as unknown as Record<string, unknown>);

    const downloadUrl = await this.storageService.generateDownloadToken(saved.id, userId);
    return this.toResponseDto(saved, stream, downloadUrl);
  }

  async createSnapshot(dto: SnapshotCreateDto, userId: string): Promise<EvidenceResponseDto> {
    const buffer = Buffer.from(dto.imageBase64, 'base64');

    if (buffer.length > MAX_SNAPSHOT_BYTES) {
      throw new BadRequestException('El snapshot supera el tamaño máximo permitido de 10MB');
    }

    if (!isValidImageBuffer(buffer)) {
      throw new BadRequestException('El buffer no corresponde a una imagen PNG o JPEG válida');
    }

    const fakeFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'snapshot.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer,
      size: buffer.length,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };

    const createDto: CreateEvidenceDto = {
      streamId: dto.streamId,
      type: EvidenceType.SNAPSHOT,
      recordedAt: new Date().toISOString(),
      metadata: dto.metadata,
    };

    return this.create(fakeFile, createDto, userId, '');
  }

  async createDvrClip(dto: CreateDvrClipDto, userId: string): Promise<EvidenceResponseDto> {
    const stream = await this.streamRepository.findOne({ where: { id: dto.streamId } });
    if (!stream) throw new NotFoundException(`Stream ${dto.streamId} no encontrado`);

    const dvrAvailable = await this.wowzaService.checkDvrAvailable(stream.wowzaAppName);
    if (!dvrAvailable) {
      throw new BadRequestException('DVR no disponible para este stream');
    }

    const startMs = new Date(dto.startTime).getTime();
    const endMs = new Date(dto.endTime).getTime();

    if (endMs <= startMs) {
      throw new BadRequestException('endTime debe ser posterior a startTime');
    }

    const durationMs = endMs - startMs;
    const durationSeconds = Math.round(durationMs / 1000);

    const dvrClipUrl = await this.wowzaService.buildDvrClipUrl(
      stream.wowzaAppName,
      stream.wowzaStreamName,
      startMs,
      durationMs,
    );

    const evidenceId = crypto.randomUUID();
    const storagePath = `dvr/${stream.wowzaAppName}/${stream.wowzaStreamName}/${evidenceId}.m3u8`;
    const hashSha256 = crypto.createHash('sha256').update(dvrClipUrl).digest('hex');

    const metadata: Record<string, unknown> = {
      dvrClipUrl,
      startTime: dto.startTime,
      endTime: dto.endTime,
      appName: stream.wowzaAppName,
      streamName: stream.wowzaStreamName,
    };
    if (dto.description) metadata['description'] = dto.description;

    const evidence = this.evidenceRepository.create({
      id: evidenceId,
      type: EvidenceType.DVR_CLIP,
      storagePath,
      hashSha256,
      fileSizeBytes: '0',
      durationSeconds,
      metadata,
      recordedAt: new Date(dto.startTime),
      stream: { id: stream.id } as Stream,
      uploadedBy: { id: userId } as User,
    });

    const saved = await this.evidenceRepository.save(evidence);

    await this.auditService.logAction(
      'DVR_CLIP_CREATED',
      'Evidence',
      saved.id,
      userId,
      undefined,
      {
        streamId: dto.streamId,
        startTime: dto.startTime,
        endTime: dto.endTime,
        durationSeconds,
        dvrClipUrl,
      },
    );

    this.gateway.emitEvidenceCreated(saved as unknown as Record<string, unknown>);

    const downloadUrl = await this.storageService.generateDownloadToken(saved.id, userId);
    return this.toResponseDto(saved, stream, downloadUrl);
  }

  async findAll(
    filters: EvidenceFiltersDto,
    userId: string,
    userRole: string,
  ): Promise<PaginatedEvidencesResponse> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const qb = this.evidenceRepository
      .createQueryBuilder('evidence')
      .leftJoinAndSelect('evidence.stream', 'stream')
      .leftJoinAndSelect('evidence.event', 'event')
      .leftJoinAndSelect('evidence.uploadedBy', 'uploadedBy');

    if (userRole === 'viewer') {
      qb.andWhere('uploadedBy.id = :viewerUserId', { viewerUserId: userId });
    }

    if (filters.type) {
      qb.andWhere('evidence.type = :type', { type: filters.type });
    }

    if (filters.streamId) {
      qb.andWhere('stream.id = :streamId', { streamId: filters.streamId });
    }

    if (filters.eventId) {
      qb.andWhere('event.id = :eventId', { eventId: filters.eventId });
    }

    if (filters.uploadedBy) {
      qb.andWhere('uploadedBy.id = :uploadedById', { uploadedById: filters.uploadedBy });
    }

    if (filters.fromDate) {
      qb.andWhere('evidence.recordedAt >= :fromDate', { fromDate: filters.fromDate });
    }

    if (filters.toDate) {
      qb.andWhere('evidence.recordedAt <= :toDate', { toDate: filters.toDate });
    }

    if (filters.search) {
      qb.andWhere("evidence.metadata::text ILIKE :search", {
        search: `%${filters.search}%`,
      });
    }

    qb.orderBy('evidence.recordedAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items.map((e) => this.toResponseDto(e, e.stream)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, userId: string, userRole: string): Promise<EvidenceResponseDto> {
    const evidence = await this.evidenceRepository.findOne({
      where: { id },
      relations: ['stream', 'event', 'uploadedBy'],
    });

    if (!evidence) throw new NotFoundException(`Evidence ${id} no encontrada`);

    if (userRole === 'viewer' && evidence.uploadedBy?.id !== userId) {
      throw new ForbiddenException('No tienes acceso a esta evidencia');
    }

    await this.auditService.logAction('EVIDENCE_VIEWED', 'Evidence', id, userId);

    const downloadUrl = await this.storageService.generateDownloadToken(id, userId);
    return this.toResponseDto(evidence, evidence.stream, downloadUrl);
  }

  async verifyIntegrity(id: string, userId: string): Promise<IntegrityVerificationResult> {
    const evidence = await this.evidenceRepository.findOne({ where: { id } });
    if (!evidence) throw new NotFoundException(`Evidence ${id} no encontrada`);

    const absolutePath = this.storageService.getAbsolutePath(evidence.storagePath);
    const result = await this.integrityService.verifyIntegrity(absolutePath, evidence.hashSha256);

    await this.auditService.logAction(
      'EVIDENCE_INTEGRITY_VERIFIED',
      'Evidence',
      id,
      userId,
      undefined,
      { isValid: result.isValid, computedHash: result.computedHash },
    );

    if (!result.isValid) {
      this.gateway.emitAlert({
        id: crypto.randomUUID(),
        level: 'critical',
        category: 'stream',
        title: 'Integridad comprometida',
        message: `Evidencia ${id} no pasa verificación de integridad`,
        timestamp: new Date().toISOString(),
      });
    }

    return result;
  }

  async exportEvidence(
    id: string,
    userId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const evidence = await this.evidenceRepository.findOne({
      where: { id },
      relations: ['stream', 'event', 'uploadedBy', 'uploadedBy.role'],
    });

    if (!evidence) throw new NotFoundException(`Evidence ${id} no encontrada`);

    const auditEntries = await this.auditService.findByEntity('Evidence', id);
    const buffer = await this.exportService.exportEvidence(evidence, auditEntries);

    await this.auditService.logAction('EVIDENCE_EXPORTED', 'Evidence', id, userId);

    const timestamp = Date.now();
    return { buffer, filename: `evidence-${id}-${timestamp}.zip` };
  }

  async prepareDownload(
    token: string,
    userIp?: string,
  ): Promise<{ absolutePath: string; hashSha256: string; storagePath: string; evidenceId: string }> {
    const resolved = await this.storageService.resolveDownloadToken(token);
    if (!resolved) {
      throw new ForbiddenException('Token inválido o expirado');
    }

    const { evidenceId, userId } = resolved;
    const evidence = await this.evidenceRepository.findOne({ where: { id: evidenceId } });
    if (!evidence) throw new NotFoundException('Evidencia no encontrada');

    const absolutePath = this.storageService.getAbsolutePath(evidence.storagePath);

    await this.storageService.invalidateDownloadToken(token);
    await this.auditService.logAction(
      'EVIDENCE_DOWNLOADED',
      'Evidence',
      evidenceId,
      userId,
      userIp,
      { evidenceId },
    );

    return { absolutePath, hashSha256: evidence.hashSha256, storagePath: evidence.storagePath, evidenceId };
  }

  async remove(id: string, userId: string): Promise<void> {
    const evidence = await this.evidenceRepository.findOne({ where: { id } });
    if (!evidence) throw new NotFoundException(`Evidence ${id} no encontrada`);

    await this.evidenceRepository.softDelete(id);
    await this.auditService.logAction('EVIDENCE_DELETED', 'Evidence', id, userId);
  }

  private toResponseDto(
    evidence: Evidence,
    stream?: Stream | null,
    downloadUrl?: string,
  ): EvidenceResponseDto {
    const uploadedBy = evidence.uploadedBy;
    return {
      id: evidence.id,
      type: evidence.type,
      streamId: stream?.id ?? evidence.stream?.id,
      streamName: stream?.name ?? evidence.stream?.name,
      eventId: evidence.event?.id,
      uploadedById: uploadedBy?.id,
      uploadedByName: uploadedBy
        ? `${uploadedBy.firstName ?? ''} ${uploadedBy.lastName ?? ''}`.trim()
        : undefined,
      hashSha256: evidence.hashSha256,
      fileSizeBytes: evidence.fileSizeBytes,
      durationSeconds: evidence.durationSeconds,
      metadata: evidence.metadata,
      recordedAt: evidence.recordedAt?.toISOString(),
      createdAt: evidence.createdAt?.toISOString() ?? new Date().toISOString(),
      integrityStatus: 'unknown',
      downloadUrl,
    };
  }
}
