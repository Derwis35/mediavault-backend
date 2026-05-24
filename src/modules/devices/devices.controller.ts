import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { AssignUserDto } from './dto/assign-user.dto';
import { DeviceFiltersDto } from './dto/device-filters.dto';
import { DeviceStatus } from './entities/device.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthUser {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
}

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @Roles('admin', 'supervisor', 'operator', 'viewer')
  findAll(@Query() filters: DeviceFiltersDto) {
    return this.devicesService.findAll(filters);
  }

  @Post()
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDeviceDto, @CurrentUser() user: AuthUser) {
    return this.devicesService.create(dto, user.userId);
  }

  @Get(':id')
  @Roles('admin', 'supervisor', 'operator', 'viewer')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.devicesService.findOne(id);
  }

  @Patch(':id')
  @Roles('admin', 'supervisor')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeviceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devicesService.update(id, dto, user.userId);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.devicesService.remove(id, user.userId);
  }

  @Post(':id/assign')
  @Roles('admin', 'supervisor')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devicesService.assignToUser(id, dto.userId, user.userId);
  }

  @Post(':id/unassign')
  @Roles('admin', 'supervisor')
  unassign(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.devicesService.unassignFromUser(id, user.userId);
  }

  @Patch(':id/status/active')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.OK)
  setActive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.devicesService.updateStatus(id, DeviceStatus.ACTIVE, user.userId);
  }

  @Patch(':id/status/inactive')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.OK)
  setInactive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.devicesService.updateStatus(id, DeviceStatus.INACTIVE, user.userId);
  }

  @Patch(':id/status/registered')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.OK)
  setRegistered(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.devicesService.updateStatus(id, DeviceStatus.REGISTERED, user.userId);
  }

  @Get(':id/live-status')
  @Roles('admin', 'supervisor', 'operator', 'viewer')
  async getLiveStatus(@Param('id', ParseUUIDPipe) id: string) {
    const device = await this.devicesService.findOne(id);
    return {
      isLive: device.status === DeviceStatus.ACTIVE,
      lastSeen: device.lastSeen ?? null,
    };
  }
}
