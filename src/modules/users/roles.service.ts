import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { RolePermissions } from './interfaces/role-permissions.interface';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
  ) {}

  findAll(): Promise<Role[]> {
    return this.roleRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException(`Rol ${id} no encontrado`);
    return role;
  }

  async updatePermissions(id: string, permissions: RolePermissions): Promise<Role> {
    const role = await this.findOne(id);
    if (role.name === 'admin') {
      throw new ForbiddenException('Los permisos del rol admin no pueden modificarse');
    }
    role.permissions = permissions as unknown as Record<string, unknown>;
    return this.roleRepo.save(role);
  }
}
