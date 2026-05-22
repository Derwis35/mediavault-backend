import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { RolePermissions } from './interfaces/role-permissions.interface';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const EMPTY_PERMISSIONS: RolePermissions = {
  canViewStreams: false,
  canManageDevices: false,
  canViewEvidences: false,
  canManageUsers: false,
  canConfigureWowza: false,
  canViewAuditLog: false,
  canDownloadReports: false,
  canManagePermissions: false,
};

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
  ) {}

  findAll(): Promise<Role[]> {
    return this.roleRepo.find({ order: { isSystem: 'DESC', name: 'ASC' } });
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException(`Rol ${id} no encontrado`);
    return role;
  }

  async create(dto: CreateRoleDto): Promise<Role> {
    const existing = await this.roleRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`El grupo '${dto.name}' ya existe`);
    const role = this.roleRepo.create({
      name: dto.name,
      description: dto.description,
      permissions: EMPTY_PERMISSIONS as unknown as Record<string, unknown>,
      isSystem: false,
    });
    return this.roleRepo.save(role);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id);
    if (role.isSystem) throw new ForbiddenException('Los grupos del sistema no pueden modificarse');
    if (dto.name && dto.name !== role.name) {
      const existing = await this.roleRepo.findOne({ where: { name: dto.name } });
      if (existing) throw new ConflictException(`El nombre '${dto.name}' ya está en uso`);
      role.name = dto.name;
    }
    if (dto.description !== undefined) role.description = dto.description;
    return this.roleRepo.save(role);
  }

  async updatePermissions(id: string, permissions: RolePermissions, actorRole: string): Promise<Role> {
    const role = await this.findOne(id);
    if (role.name === 'admin' || role.name === 'superadmin') {
      throw new ForbiddenException('Los permisos de este rol no pueden modificarse');
    }
    const current = (role.permissions ?? {}) as Record<string, unknown>;
    if (
      permissions.canManagePermissions !== current['canManagePermissions'] &&
      actorRole !== 'superadmin'
    ) {
      throw new ForbiddenException('Solo el Super Administrador puede modificar el permiso de gestión de grupos');
    }
    role.permissions = permissions as unknown as Record<string, unknown>;
    return this.roleRepo.save(role);
  }

  async remove(id: string): Promise<void> {
    const role = await this.findOne(id);
    if (role.isSystem) throw new ForbiddenException('Los grupos del sistema no pueden eliminarse');
    await this.roleRepo.remove(role);
  }
}
