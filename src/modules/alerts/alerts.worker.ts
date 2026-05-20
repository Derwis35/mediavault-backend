import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertsService } from './alerts.service';
import { AlertCondition } from './entities/alert-rule.entity';
import { StreamsService } from '../streams/streams.service';
import { StreamStatus } from '../streams/entities/stream.entity';

@Injectable()
export class AlertsWorker {
  private readonly logger = new Logger(AlertsWorker.name);

  constructor(
    private readonly alertsService: AlertsService,
    @Inject(forwardRef(() => StreamsService))
    private readonly streamsService: StreamsService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async evaluateRules(): Promise<void> {
    const rules = await this.alertsService.findAllRules({ enabled: true });

    if (rules.length === 0) return;

    let evaluated = 0;

    await Promise.allSettled(
      rules.map(async (rule) => {
        try {
          if (!rule.streamId) return;

          const stream = await this.streamsService.findOne(rule.streamId).catch(() => null);
          if (!stream) return;

          let shouldTrigger = false;
          let message = '';

          switch (rule.condition) {
            case AlertCondition.STREAM_DOWN:
            case AlertCondition.NO_SIGNAL:
              shouldTrigger =
                stream.status === StreamStatus.ERROR ||
                stream.status === StreamStatus.INACTIVE;
              message = `Stream '${stream.name}' está ${stream.status === StreamStatus.ERROR ? 'en error' : 'inactivo'}`;
              break;

            case AlertCondition.RECONNECTING:
              shouldTrigger = stream.status === StreamStatus.CONNECTING;
              message = `Stream '${stream.name}' está reconectando`;
              break;

            default:
              return;
          }

          if (shouldTrigger) {
            await this.alertsService.triggerAlert(rule.id, {
              streamId: rule.streamId,
              message,
              extra: { streamStatus: stream.status, streamName: stream.name },
            });
          }

          evaluated++;
        } catch (err) {
          this.logger.warn(
            `[WORKER] Error evaluando regla ${rule.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    );

    this.logger.debug(`[WORKER] Evaluadas ${evaluated}/${rules.length} reglas`);
  }
}
