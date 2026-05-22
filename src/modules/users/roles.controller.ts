import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolesService } from './roles.service';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Roles('admin', 'supervisor')
  findAll() { return this.rolesService.findAll(); }

  @Get(':id')
  @Roles('admin', 'supervisor')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.rolesService.findOne(id); }

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateRoleDto) { return this.rolesService.create(dto); }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Patch(':id/permissions')
  @Roles('admin', 'superadmin')
  updatePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() permissions: UpdatePermissionsDto,
    @CurrentUser() actor: { role: string },
  ) {
    return this.rolesService.updatePermissions(id, permissions, actor.role);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.rolesService.remove(id); }
}
