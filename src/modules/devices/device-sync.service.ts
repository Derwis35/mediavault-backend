import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { Device } from './entities/device.entity';

@Injectable()
export class DeviceSyncService {
  private readonly logger = new Logger(DeviceSyncService.name);

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
  ) {}

  @Cron('*/30 * * * * *')
  async syncWithWowza(): Promise<void> {
    // Streaming configuration has moved to the Stream entity.
    // Device status is now managed directly via the devices API.
    void this.deviceRepository;
  }
}
