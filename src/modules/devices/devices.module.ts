import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevicesService } from './devices.service';
import { DeviceSyncService } from './device-sync.service';
import { DevicesController } from './devices.controller';
import { Device } from './entities/device.entity';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, User]),
    AuditModule,
  ],
  controllers: [DevicesController],
  providers: [DevicesService, DeviceSyncService],
  exports: [DevicesService],
})
export class DevicesModule {}
