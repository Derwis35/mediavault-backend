import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User } from './entities/user.entity';
import { Role, RoleName } from './entities/role.entity';
import { Session } from '../auth/entities/session.entity';
import { SecurityService } from '../security/security.service';
import { AuditService } from '../audit/audit.service';
import { StreamingGateway } from '../gateway/streaming.gateway';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserFiltersDto } from './dto/user-filters.dto';
import { UserResponseDto, PaginatedUsersResponse } from './dto/user-response.dto';
import { AuditLogEntry } from '../audit/dto/audit-response.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    private readonly securityService: SecurityService,
    private readonly auditService: AuditService,
    private readonly gateway: StreamingGateway,
  ) {}

  async create(dto: CreateUserDto, adminUserId: string): Promise<UserResponseDto> {
    const email = dto.email ? dto.email.toLowerCase() : null;

    const role = await this.roleRepository.findOne({
      where: { name: dto.role as RoleName },
    });
    if (!role) throw new NotFoundException(`Rol '${dto.role}' no encontrado`);

    if (dto.idNumber) {
      const existingId = await this.userRepository.findOne({ where: { idNumber: dto.idNumber } });
      if (existingId) throw new ConflictException('El número de identificación ya está registrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepository.create({
      email: email ?? '',
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      isActive: dto.isActive ?? true,
      role,
      idType: (dto.idType as User['idType']) ?? null,
      idNumber: dto.idNumber ?? null,
      cargo: dto.cargo ?? null,
    });
    const saved = await this.userRepository.save(user);

    await this.auditService.log({
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: saved.id,
      userId: adminUserId,
      metadata: { newUserId: saved.id, role: dto.role, createdByAdmin: adminUserId },
    });

    return this.toDto(saved, 0);
  }

  async findAll(filters: UserFiltersDto): Promise<PaginatedUsersResponse> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const qb = this.userRepository
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.role', 'role')
      .orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.role) {
      qb.andWhere('role.name = :role', { role: filters.role });
    }
    if (filters.isActive !== undefined) {
      qb.andWhere('u.isActive = :isActive', { isActive: filters.isActive });
    }
    if (filters.search) {
      qb.andWhere(
        '(LOWER(u.email) ILIKE :search OR LOWER(u.firstName) ILIKE :search OR LOWER(u.lastName) ILIKE :search)',
        { search: `%${filters.search.toLowerCase()}%` },
      );
    }

    const [users, total] = await qb.getManyAndCount();

    const now = new Date();
    const enriched = await Promise.all(
      users.map(async (u) => {
        const count = await this.sessionRepository.count({
          where: { user: { id: u.id }, expiresAt: MoreThan(now) },
        });
        return this.toDto(u, count);
      }),
    );

    return { items: enriched, total, page, limit };
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['role'] });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const now = new Date();
    const [activeSessionsCount, lastSession] = await Promise.all([
      this.sessionRepository.count({ where: { user: { id }, expiresAt: MoreThan(now) } }),
      this.sessionRepository.findOne({
        where: { user: { id } },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const dto = this.toDto(user, activeSessionsCount);
    if (lastSession) dto.lastLoginAt = lastSession.createdAt.toISOString();
    return dto;
  }

  async update(id: string, dto: UpdateUserDto, adminUserId: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['role'] });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (dto.role) {
      const role = await this.roleRepository.findOne({
        where: { name: dto.role as RoleName },
      });
      if (!role) throw new NotFoundException(`Rol '${dto.role}' no encontrado`);

      const activeSessions = await this.sessionRepository.count({
        where: { user: { id }, expiresAt: MoreThan(new Date()) },
      });

      if (activeSessions > 0) {
        this.gateway.emitAlert({
          id: randomUUID(),
          level: 'warning',
          category: 'auth',
          title: 'Rol modificado',
          message: 'Rol de usuario modificado con sesiones activas',
          timestamp: new Date().toISOString(),
        });
      }

      user.role = role;
    }

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.idType !== undefined) user.idType = (dto.idType as User['idType']) ?? null;
    if (dto.idNumber !== undefined) {
      if (dto.idNumber) {
        const existingId = await this.userRepository.findOne({ where: { idNumber: dto.idNumber } });
        if (existingId && existingId.id !== id) throw new ConflictException('El número de identificación ya está registrado');
      }
      user.idNumber = dto.idNumber ?? null;
    }
    if (dto.cargo !== undefined) user.cargo = dto.cargo ?? null;
    if (dto.zoneId !== undefined) user.zoneId = dto.zoneId ?? null;
    if (dto.quadrantId !== undefined) user.quadrantId = dto.quadrantId ?? null;

    const saved = await this.userRepository.save(user);

    await this.auditService.log({
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: id,
      userId: adminUserId,
      metadata: { changes: Object.keys(dto), targetUserId: id },
    });

    return this.toDto(saved, 0);
  }

  async deactivate(id: string, adminUserId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['role'] });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (id === adminUserId) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta');
    }

    if (user.role?.name === RoleName.ADMIN) {
      const adminCount = await this.userRepository
        .createQueryBuilder('u')
        .leftJoin('u.role', 'role')
        .where('role.name = :role', { role: RoleName.ADMIN })
        .andWhere('u.isActive = true')
        .getCount();

      if (adminCount <= 1) {
        throw new BadRequestException('No se puede desactivar el último admin');
      }
    }

    user.isActive = false;
    await this.userRepository.save(user);

    await this.securityService.revokeAllUserSessions(id, adminUserId);

    await this.auditService.log({
      action: 'USER_DEACTIVATED',
      entityType: 'User',
      entityId: id,
      userId: adminUserId,
    });
  }

  async activate(id: string, adminUserId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (user.isActive) {
      throw new BadRequestException('La cuenta ya está activa');
    }

    user.isActive = true;
    await this.userRepository.save(user);

    await this.auditService.log({
      action: 'USER_ACTIVATED',
      entityType: 'User',
      entityId: id,
      userId: adminUserId,
    });
  }

  async changePasswordByAdmin(
    targetId: string,
    dto: ChangePasswordDto,
    adminUserId: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: targetId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.userRepository.save(user);

    await this.securityService.revokeAllUserSessions(targetId, adminUserId);

    await this.auditService.log({
      action: 'PASSWORD_CHANGED_BY_ADMIN',
      entityType: 'User',
      entityId: targetId,
      userId: adminUserId,
      metadata: { targetUserId: targetId },
    });
  }

  async changeOwnPassword(
    userId: string,
    dto: ChangePasswordDto,
    sessionId: string,
  ): Promise<void> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Las contraseñas no coinciden');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'passwordHash', 'firstName', 'lastName', 'isActive'],
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const valid = await bcrypt.compare(dto.currentPassword ?? '', user.passwordHash);
    if (!valid) throw new UnauthorizedException('Contraseña actual incorrecta');

    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.userRepository.save(user);

    // Revoke all OTHER sessions (preserve the current one)
    const activeSessions = await this.sessionRepository.find({
      where: { user: { id: userId }, expiresAt: MoreThan(new Date()) },
    });
    const otherIds = activeSessions.filter((s) => s.id !== sessionId).map((s) => s.id);
    if (otherIds.length > 0) {
      await this.sessionRepository.delete(otherIds);
    }

    await this.auditService.log({
      action: 'PASSWORD_CHANGED_BY_USER',
      entityType: 'User',
      entityId: userId,
      userId,
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({ where: { id: userId }, relations: ['role'] });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;

    const saved = await this.userRepository.save(user);

    await this.auditService.log({
      action: 'PROFILE_UPDATED',
      entityType: 'User',
      entityId: userId,
      userId,
    });

    return this.toDto(saved, 0);
  }

  async getUserAuditHistory(
    userId: string,
    requestingUserId: string,
    requestingRole: string,
  ): Promise<AuditLogEntry[]> {
    if (requestingRole !== 'admin' && requestingUserId !== userId) {
      throw new ForbiddenException('No tienes permisos para ver este historial');
    }
    return this.auditService.findByUser(userId, 200);
  }

  async remove(id: string, adminUserId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['role'] });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (id === adminUserId) {
      throw new BadRequestException('No puedes eliminarte a ti mismo');
    }

    if (user.role?.name === RoleName.ADMIN) {
      const adminCount = await this.userRepository
        .createQueryBuilder('u')
        .leftJoin('u.role', 'role')
        .where('role.name = :role', { role: RoleName.ADMIN })
        .andWhere('u.isActive = true')
        .getCount();

      if (adminCount <= 1) {
        throw new BadRequestException('No se puede eliminar el último admin');
      }
    }

    await this.securityService.revokeAllUserSessions(id, adminUserId);

    await this.auditService.log({
      action: 'USER_DELETED',
      entityType: 'User',
      entityId: id,
      userId: adminUserId,
    });

    await this.userRepository.softDelete(id);
  }

  async getUserSessions(userId: string) {
    // Verify user exists before returning sessions
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return this.securityService.getActiveSessions({ userId });
  }

  async getRoles(): Promise<Role[]> {
    return this.roleRepository.find({ order: { name: 'ASC' } });
  }

  private toDto(user: User, activeSessionsCount: number, lastLoginAt?: string): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      idType: user.idType ?? null,
      idNumber: user.idNumber ?? null,
      cargo: user.cargo ?? null,
      zoneId: user.zoneId ?? null,
      quadrantId: user.quadrantId ?? null,
      role: user.role
        ? { id: user.role.id, name: user.role.name, description: user.role.description }
        : undefined,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      activeSessionsCount,
      lastLoginAt,
    };
  }
}
