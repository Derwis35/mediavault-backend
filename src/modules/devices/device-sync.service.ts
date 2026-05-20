import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Device, DeviceStatus } from './entities/device.entity';
import { WowzaService } from '../wowza/wowza.service';

@Injectable()
export class DeviceSyncService {
  private readonly logger = new Logger(DeviceSyncService.name);

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly wowzaService: WowzaService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('*/30 * * * * *')
  async syncWithWowza(): Promise<void> {
    try {
      const appName = this.configService.get<string>('wowza.appName') ?? 'live';

      const [devices, activeStreams] = await Promise.all([
        this.deviceRepository.find(),
        this.wowzaService.getIncomingStreams(appName).catch((err: unknown) => {
          this.logger.warn(
            `No se pudo obtener streams de Wowza: ${err instanceof Error ? err.message : String(err)}`,
          );
          return [];
        }),
      ]);

      if (devices.length === 0) return;

      const activeStreamNames = new Set(activeStreams.map((s) => s.name));
      const now = new Date();
      const toSave: Device[] = [];

      for (const device of devices) {
        if (!device.isActive) continue;

        const isLive = activeStreamNames.has(device.wowzaStreamName);

        if (isLive) {
          // Always refresh lastSeen; only change status if not already ACTIVE
          device.lastSeen = now;
          if (device.status !== DeviceStatus.ACTIVE) {
            device.status = DeviceStatus.ACTIVE;
            this.logger.log(`[SYNC] ${device.serial} → ACTIVE`);
          }
          toSave.push(device);
        } else if (device.status === DeviceStatus.ACTIVE) {
          device.status = DeviceStatus.INACTIVE;
          this.logger.log(`[SYNC] ${device.serial} → INACTIVE (stream ausente)`);
          toSave.push(device);
        }
      }

      if (toSave.length > 0) {
        await this.deviceRepository.save(toSave);
        this.logger.log(`[SYNC] ${toSave.length} dispositivo(s) actualizados`);
      }
    } catch (err) {
      this.logger.error(
        `[SYNC] Error inesperado: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
