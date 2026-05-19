import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';
import { Event, EventStatus } from './entities/event.entity';
import { Stream } from '../streams/entities/stream.entity';
import { User } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { StreamingGateway } from '../gateway/streaming.gateway';
import { StreamStatus, StreamProtocol } from '../streams/entities/stream.entity';

const mockUser: Partial<User> = {
  id: 'user-uuid',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@test.com',
};

const mockStream: Partial<Stream> = {
  id: 'stream-uuid',
  name: 'Cam 01',
  status: StreamStatus.ACTIVE,
  wowzaAppName: 'live',
  protocol: StreamProtocol.RTMP,
};

const mockEvent: Partial<Event> = {
  id: 'event-uuid',
  title: 'Incidente robo',
  status: EventStatus.OPEN,
  streams: [],
  evidences: [],
  createdBy: mockUser as User,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const buildQb = (results: Event[]) => ({
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  loadRelationCountAndMap: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([results, results.length]),
  getOne: jest.fn().mockResolvedValue(results[0] ?? null),
});

describe('EventsService', () => {
  let service: EventsService;
  let eventRepository: jest.Mocked<any>;
  let streamRepository: jest.Mocked<any>;
  let userRepository: jest.Mocked<any>;
  let auditService: jest.Mocked<Pick<AuditService, 'log'>>;
  let gateway: jest.Mocked<Pick<StreamingGateway, 'emitAlert'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: getRepositoryToken(Event),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            softDelete: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Stream),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: StreamingGateway,
          useValue: { emitAlert: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(EventsService);
    eventRepository = module.get(getRepositoryToken(Event));
    streamRepository = module.get(getRepositoryToken(Stream));
    userRepository = module.get(getRepositoryToken(User));
    auditService = module.get(AuditService);
    gateway = module.get(StreamingGateway);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('asocia streamIds correctamente al crear evento', async () => {
      userRepository.findOne.mockResolvedValueOnce(mockUser as User);
      streamRepository.findOne.mockResolvedValueOnce(mockStream as Stream);
      eventRepository.create.mockReturnValueOnce({ ...mockEvent, streams: [mockStream] } as Event);
      eventRepository.save.mockResolvedValueOnce({ ...mockEvent, id: 'event-uuid', streams: [mockStream] } as Event);

      const savedWithCount = { ...mockEvent, streams: [mockStream], evidenceCount: 0 } as Event & { evidenceCount: number };
      const qb = buildQb([savedWithCount]);
      eventRepository.createQueryBuilder.mockReturnValueOnce(qb);

      const result = await service.create(
        { title: 'Incidente robo', streamIds: ['stream-uuid'] },
        'user-uuid',
      );

      expect(streamRepository.findOne).toHaveBeenCalledWith({ where: { id: 'stream-uuid' } });
      expect(result.streams).toHaveLength(1);
      expect(result.streams[0].id).toBe('stream-uuid');
    });

    it('lanza BadRequestException si un streamId no existe', async () => {
      userRepository.findOne.mockResolvedValueOnce(mockUser as User);
      streamRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.create({ title: 'Test', streamIds: ['nonexistent-uuid'] }, 'user-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('emite alerta WebSocket al crear evento', async () => {
      userRepository.findOne.mockResolvedValueOnce(mockUser as User);
      eventRepository.create.mockReturnValueOnce(mockEvent as Event);
      eventRepository.save.mockResolvedValueOnce(mockEvent as Event);

      const qb = buildQb([{ ...mockEvent, evidenceCount: 0 } as Event & { evidenceCount: number }]);
      eventRepository.createQueryBuilder.mockReturnValueOnce(qb);

      await service.create({ title: 'Nuevo incidente' }, 'user-uuid');

      expect(gateway.emitAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          category: 'stream',
          title: 'Nuevo evento creado',
          message: 'Nuevo incidente',
        }),
      );
    });
  });

  // ─── close() / emitAlert on close ─────────────────────────────────────────

  describe('close()', () => {
    it('emite alerta WebSocket al cerrar un evento', async () => {
      const openEvent = { ...mockEvent, status: EventStatus.OPEN } as Event;
      eventRepository.findOne.mockResolvedValueOnce(openEvent);
      eventRepository.save.mockResolvedValueOnce({ ...openEvent, status: EventStatus.CLOSED });

      const qb = buildQb([{ ...openEvent, status: EventStatus.CLOSED, evidenceCount: 0 } as Event & { evidenceCount: number }]);
      eventRepository.createQueryBuilder.mockReturnValueOnce(qb);

      await service.close('event-uuid', 'user-uuid');

      expect(gateway.emitAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Evento cerrado',
          message: openEvent.title,
        }),
      );
    });
  });

  // ─── addStream() ──────────────────────────────────────────────────────────

  describe('addStream()', () => {
    it('lanza NotFoundException si el stream no existe', async () => {
      eventRepository.findOne.mockResolvedValueOnce(mockEvent as Event);
      streamRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.addStream('event-uuid', 'nonexistent-stream', 'user-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findAll() ────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('filtra correctamente por status', async () => {
      const closedEvent = { ...mockEvent, status: EventStatus.CLOSED, evidenceCount: 0 } as Event & { evidenceCount: number };
      const qb = buildQb([closedEvent]);
      eventRepository.createQueryBuilder.mockReturnValueOnce(qb);

      const result = await service.findAll({ status: EventStatus.CLOSED, page: 1, limit: 20 });

      expect(qb.andWhere).toHaveBeenCalledWith('event.status = :status', { status: EventStatus.CLOSED });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe(EventStatus.CLOSED);
    });
  });
});
