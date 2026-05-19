import { Controller, Get } from '@nestjs/common';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';
import { WowzaService } from '../wowza/wowza.service';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly redisService: RedisService,
    private readonly wowzaService: WowzaService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  async check() {
    const storagePath = this.configService.get<string>('STORAGE_PATH') || './storage';
    const absPath = path.resolve(storagePath);

    const result = await this.health.check([
      () => this.db.pingCheck('database'),
      () => this.disk.checkStorage('disk', { path: absPath, thresholdPercent: 0.95 }),
      () => this.memory.checkHeap('memory_heap', 500 * 1024 * 1024),
      async () => {
        const ok = await this.redisService.ping().catch(() => false);
        return {
          redis: {
            status: ok ? 'up' : 'down',
          },
        };
      },
    ]);

    let wowzaOnline = false;
    try {
      const status = await this.wowzaService.getServerStatus();
      wowzaOnline = status.isOnline;
    } catch {
      // best-effort
    }

    return { ...result, wowza: { isOnline: wowzaOnline } };
  }
}
