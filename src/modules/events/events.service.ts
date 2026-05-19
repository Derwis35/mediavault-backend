import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event, EventStatus } from './entities/event.entity';
import { Stream } from '../streams/entities/stream.entity';
import { User } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { StreamingGateway } from '../gateway/streaming.gateway';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventFiltersDto } from './dto/event-filters.dto';
import {
  EventResponseDto,
  PaginatedEventsResponse,
  StreamSummary,
} from './dto/event-response.dto';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(Stream)
    private readonly streamRepository: Repository<Stream>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditService: AuditService,
    private readonly gateway: StreamingGateway,
  ) {}

  async create(dto: CreateEventDto, userId: string): Promise<EventResponseDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const streams = await this.resolveStreams(dto.streamIds);

    const event = this.eventRepository.create({
      title: dto.title,
      description: dto.description,
      status: dto.status ?? EventStatus.OPEN,
      location: dto.location,
      metadata: dto.metadata,
      createdBy: user,
      streams,
    });

    const saved = await this.eventRepository.save(event);

    void this.auditService.log({
      action: 'EVENT_CREATED',
      entityType: 'event',
      entityId: saved.id,
      userId,
    });

    this.gateway.emitAlert({
      id: randomUUID(),
      level: 'info',
      category: 'stream',
      title: 'Nuevo evento creado',
      message: dto.title,
      timestamp: new Date().toISOString(),
    });

    return this.findOne(saved.id);
  }

  async findAll(filters: EventFiltersDto): Promise<PaginatedEventsResponse> {
    const { status, search, fromDate, toDate, streamId, page = 1, limit = 20 } = filters;

    const qb = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.createdBy', 'createdBy')
      .leftJoinAndSelect('event.streams', 'streams')
      .loadRelationCountAndMap('event.evidenceCount', 'event.evidences')
      .orderBy('event.createdAt', 'DESC');

    if (status) qb.andWhere('event.status = :status', { status });
    if (search) {
      qb.andWhere(
        '(event.title ILIKE :search OR event.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (fromDate) qb.andWhere('event.createdAt >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('event.createdAt <= :toDate', { toDate });
    if (streamId) qb.andWhere('streams.id = :streamId', { streamId });

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((e) => this.toDto(e as Event & { evidenceCount?: number })),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<EventResponseDto> {
    const event = await this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.createdBy', 'createdBy')
      .leftJoinAndSelect('event.streams', 'streams')
      .loadRelationCountAndMap('event.evidenceCount', 'event.evidences')
      .where('event.id = :id', { id })
      .getOne();

    if (!event) throw new NotFoundException(`Evento ${id} no encontrado`);

    void this.auditService.log({
      action: 'EVENT_VIEWED',
      entityType: 'event',
      entityId: id,
    });

    return this.toDto(event as Event & { evidenceCount?: number });
  }

  async update(id: string, dto: UpdateEventDto, userId: string): Promise<EventResponseDto> {
    const event = await this.loadEventOrFail(id);

    const wasOpen = event.status === EventStatus.OPEN;

    Object.assign(event, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.location !== undefined && { location: dto.location }),
      ...(dto.metadata !== undefined && { metadata: dto.metadata }),
    });

    if (dto.streamIds !== undefined) {
      event.streams = await this.resolveStreams(dto.streamIds);
    }

    await this.eventRepository.save(event);

    if (wasOpen && dto.status === EventStatus.CLOSED) {
      this.gateway.emitAlert({
        id: randomUUID(),
        level: 'info',
        category: 'stream',
        title: 'Evento cerrado',
        message: event.title,
        timestamp: new Date().toISOString(),
      });
    }

    void this.auditService.log({
      action: 'EVENT_UPDATED',
      entityType: 'event',
      entityId: id,
      userId,
    });

    return this.findOne(id);
  }

  async addStream(eventId: string, streamId: string, userId: string): Promise<EventResponseDto> {
    const event = await this.loadEventOrFail(eventId);
    const stream = await this.streamRepository.findOne({ where: { id: streamId } });
    if (!stream) throw new NotFoundException(`Stream ${streamId} no encontrado`);

    const alreadyLinked = event.streams.some((s) => s.id === streamId);
    if (!alreadyLinked) {
      event.streams.push(stream);
      await this.eventRepository.save(event);
    }

    void this.auditService.log({
      action: 'EVENT_STREAM_ADDED',
      entityType: 'event',
      entityId: eventId,
      userId,
      metadata: { streamId },
    });

    return this.findOne(eventId);
  }

  async removeStream(eventId: string, streamId: string, userId: string): Promise<void> {
    const event = await this.loadEventOrFail(eventId);
    event.streams = event.streams.filter((s) => s.id !== streamId);
    await this.eventRepository.save(event);

    void this.auditService.log({
      action: 'EVENT_STREAM_REMOVED',
      entityType: 'event',
      entityId: eventId,
      userId,
      metadata: { streamId },
    });
  }

  async close(id: string, userId: string): Promise<EventResponseDto> {
    return this.update(id, { status: EventStatus.CLOSED }, userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    const event = await this.loadEventOrFail(id);
    await this.eventRepository.softDelete(event.id);

    void this.auditService.log({
      action: 'EVENT_DELETED',
      entityType: 'event',
      entityId: id,
      userId,
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async loadEventOrFail(id: string): Promise<Event> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['createdBy', 'streams'],
    });
    if (!event) throw new NotFoundException(`Evento ${id} no encontrado`);
    return event;
  }

  private async resolveStreams(streamIds?: string[]): Promise<Stream[]> {
    if (!streamIds?.length) return [];
    const streams = await Promise.all(
      streamIds.map((sid) => this.streamRepository.findOne({ where: { id: sid } })),
    );
    const missing = streamIds.filter((_, i) => !streams[i]);
    if (missing.length) {
      throw new BadRequestException(`StreamIds no encontrados: ${missing.join(', ')}`);
    }
    return streams as Stream[];
  }

  private toDto(event: Event & { evidenceCount?: number }): EventResponseDto {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      status: event.status,
      location: event.location,
      metadata: event.metadata,
      createdBy: event.createdBy
        ? {
            id: event.createdBy.id,
            firstName: event.createdBy.firstName,
            lastName: event.createdBy.lastName,
          }
        : undefined,
      streams: (event.streams ?? []).map(
        (s): StreamSummary => ({
          id: s.id,
          name: s.name,
          status: s.status,
          wowzaAppName: s.wowzaAppName,
        }),
      ),
      evidenceCount: event.evidenceCount ?? (event.evidences?.length ?? 0),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }
}
