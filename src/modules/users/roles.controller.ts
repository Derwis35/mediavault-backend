import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesService } from './roles.service';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Roles('admin', 'supervisor')
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @Roles('admin', 'supervisor')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id/permissions')
  @Roles('admin')
  updatePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() permissions: UpdatePermissionsDto,
  ) {
    return this.rolesService.updatePermissions(id, permissions);
  }
}
