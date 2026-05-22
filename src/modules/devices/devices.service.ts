import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device, DeviceStatus } from './entities/device.entity';
import { User } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DeviceFiltersDto } from './dto/device-filters.dto';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateDeviceDto, actorId: string): Promise<Device> {
    const existing = await this.deviceRepository.findOne({
      where: { serial: dto.serial },
    });
    if (existing) {
      throw new ConflictException(`El serial '${dto.serial}' ya está registrado`);
    }

    let assignedUser: User | null = null;
    if (dto.assignedUserId) {
      assignedUser = await this.userRepository.findOne({
        where: { id: dto.assignedUserId },
      });
      if (!assignedUser) {
        throw new NotFoundException(`Usuario '${dto.assignedUserId}' no encontrado`);
      }
    }

    const device = this.deviceRepository.create({
      name: dto.name,
      serial: dto.serial,
      type: dto.type,
      wowzaStreamName: dto.wowzaStreamName,
      assignedUser,
      status: dto.status ?? DeviceStatus.REGISTERED,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      quadrantId: dto.quadrantId ?? null,
      zoneId: dto.zoneId ?? null,
    });

    const saved = await this.deviceRepository.save(device);

    await this.auditService.log({
      action: 'DEVICE_CREATED',
      entityType: 'Device',
      entityId: saved.id,
      userId: actorId,
      metadata: { serial: saved.serial, wowzaStreamName: saved.wowzaStreamName },
    });

    this.logger.log(`[DEVICES] Creado: ${saved.serial} (${saved.id})`);
    return saved;
  }

  async findAll(filters: DeviceFiltersDto): Promise<{ data: Device[]; meta: { total: number; page: number; limit: number } }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const qb = this.deviceRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.assignedUser', 'user')
      .orderBy('d.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.status) {
      qb.andWhere('d.status = :status', { status: filters.status });
    }
    if (filters.isActive !== undefined) {
      qb.andWhere('d.isActive = :isActive', { isActive: filters.isActive });
    }
    if (filters.assignedUserId) {
      qb.andWhere('user.id = :userId', { userId: filters.assignedUserId });
    }
    if (filters.search) {
      qb.andWhere(
        '(LOWER(d.name) ILIKE :search OR LOWER(d.serial) ILIKE :search OR LOWER(d.wowzaStreamName) ILIKE :search)',
        { search: `%${filters.search.toLowerCase()}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, page, limit } };
  }

  async findOne(id: string): Promise<Device> {
    const device = await this.deviceRepository.findOne({
      where: { id },
      relations: ['assignedUser'],
    });
    if (!device) throw new NotFoundException('Dispositivo no encontrado');
    return device;
  }

  async findBySerial(serial: string): Promise<Device> {
    const device = await this.deviceRepository.findOne({
      where: { serial },
      relations: ['assignedUser'],
    });
    if (!device) throw new NotFoundException(`Dispositivo con serial '${serial}' no encontrado`);
    return device;
  }

  async update(id: string, dto: UpdateDeviceDto, actorId: string): Promise<Device> {
    const device = await this.deviceRepository.findOne({
      where: { id },
      relations: ['assignedUser'],
    });
    if (!device) throw new NotFoundException('Dispositivo no encontrado');

    if (dto.serial && dto.serial !== device.serial) {
      const conflict = await this.deviceRepository.findOne({
        where: { serial: dto.serial },
      });
      if (conflict) {
        throw new ConflictException(`El serial '${dto.serial}' ya está registrado`);
      }
      device.serial = dto.serial;
    }

    if (dto.name !== undefined) device.name = dto.name;
    if (dto.type !== undefined) device.type = dto.type;
    if (dto.wowzaStreamName !== undefined) device.wowzaStreamName = dto.wowzaStreamName;
    if (dto.status !== undefined) device.status = dto.status;
    if (dto.isActive !== undefined) device.isActive = dto.isActive;
    if (dto.latitude !== undefined) device.latitude = dto.latitude;
    if (dto.longitude !== undefined) device.longitude = dto.longitude;
    if (dto.quadrantId !== undefined) device.quadrantId = dto.quadrantId ?? null;
    if (dto.zoneId !== undefined) device.zoneId = dto.zoneId ?? null;

    if (dto.assignedUserId !== undefined) {
      const previousUserId = device.assignedUser?.id ?? null;
      if (dto.assignedUserId) {
        const user = await this.userRepository.findOne({ where: { id: dto.assignedUserId } });
        if (!user) throw new NotFoundException(`Usuario '${dto.assignedUserId}' no encontrado`);
        device.assignedUser = user;
        device.assignedAt = new Date();
        await this.auditService.log({
          action: 'DEVICE_ASSIGNED',
          entityType: 'Device',
          entityId: id,
          userId: actorId,
          metadata: { assignedTo: dto.assignedUserId, previousUser: previousUserId, assignedAt: device.assignedAt.toISOString() },
        });
      } else {
        device.assignedUser = null;
        device.assignedAt = null;
        await this.auditService.log({
          action: 'DEVICE_UNASSIGNED',
          entityType: 'Device',
          entityId: id,
          userId: actorId,
          metadata: { previousUser: previousUserId, unassignedAt: new Date().toISOString() },
        });
      }
    }

    const saved = await this.deviceRepository.save(device);

    await this.auditService.log({
      action: 'DEVICE_UPDATED',
      entityType: 'Device',
      entityId: id,
      userId: actorId,
      metadata: { changes: Object.keys(dto) },
    });

    return saved;
  }

  async remove(id: string, actorId: string): Promise<void> {
    const device = await this.deviceRepository.findOne({ where: { id } });
    if (!device) throw new NotFoundException('Dispositivo no encontrado');

    device.isActive = false;
    await this.deviceRepository.save(device);

    await this.auditService.log({
      action: 'DEVICE_DELETED',
      entityType: 'Device',
      entityId: id,
      userId: actorId,
      metadata: { serial: device.serial },
    });
  }

  async assignToUser(deviceId: string, userId: string, actorId: string): Promise<Device> {
    const [device, user] = await Promise.all([
      this.deviceRepository.findOne({ where: { id: deviceId }, relations: ['assignedUser'] }),
      this.userRepository.findOne({ where: { id: userId }, select: ['id', 'quadrantId'] }),
    ]);

    if (!device) throw new NotFoundException('Dispositivo no encontrado');
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const previousUserId = device.assignedUser?.id ?? null;
    device.assignedUser = user;
    device.assignedAt = new Date();
    device.quadrantId = user.quadrantId ?? null;
    const saved = await this.deviceRepository.save(device);

    await this.auditService.log({
      action: 'DEVICE_ASSIGNED',
      entityType: 'Device',
      entityId: deviceId,
      userId: actorId,
      metadata: { assignedTo: userId, previousUser: previousUserId, assignedAt: device.assignedAt.toISOString() },
    });

    return saved;
  }

  async unassignFromUser(deviceId: string, actorId: string): Promise<Device> {
    const device = await this.deviceRepository.findOne({
      where: { id: deviceId },
      relations: ['assignedUser'],
    });
    if (!device) throw new NotFoundException('Dispositivo no encontrado');

    const previousUserId = device.assignedUser?.id ?? null;
    device.assignedUser = null;
    device.assignedAt = null;
    device.quadrantId = null;
    const saved = await this.deviceRepository.save(device);

    await this.auditService.log({
      action: 'DEVICE_UNASSIGNED',
      entityType: 'Device',
      entityId: deviceId,
      userId: actorId,
      metadata: { previousUser: previousUserId, unassignedAt: new Date().toISOString() },
    });

    return saved;
  }

  async updateStatus(deviceId: string, status: DeviceStatus, actorId: string): Promise<Device> {
    const device = await this.deviceRepository.findOne({
      where: { id: deviceId },
      relations: ['assignedUser'],
    });
    if (!device) throw new NotFoundException('Dispositivo no encontrado');

    const previousStatus = device.status;
    device.status = status;
    if (status === DeviceStatus.ACTIVE) {
      device.lastSeen = new Date();
    }
    const saved = await this.deviceRepository.save(device);

    await this.auditService.log({
      action: 'DEVICE_STATUS_CHANGED',
      entityType: 'Device',
      entityId: deviceId,
      userId: actorId,
      metadata: { previousStatus, newStatus: status },
    });

    return saved;
  }
}
