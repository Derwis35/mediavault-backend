import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { AlertsWorker } from './alerts.worker';
import { AlertRule } from './entities/alert-rule.entity';
import { AlertEvent } from './entities/alert-event.entity';
import { GatewayModule } from '../gateway/gateway.module';
import { StreamsModule } from '../streams/streams.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AlertRule, AlertEvent]),
    forwardRef(() => GatewayModule),
    forwardRef(() => StreamsModule),
  ],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsWorker],
  exports: [AlertsService],
})
export class AlertsModule {}
