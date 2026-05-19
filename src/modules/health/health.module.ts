import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { WowzaModule } from '../wowza/wowza.module';

@Module({
  imports: [TerminusModule, WowzaModule],
  controllers: [HealthController],
})
export class HealthModule {}
