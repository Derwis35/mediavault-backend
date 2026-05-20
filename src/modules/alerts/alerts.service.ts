import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertRule } from './entities/alert-rule.entity';
import { AlertEvent } from './entities/alert-event.entity';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';
import { User } from '../users/entities/user.entity';
import { StreamingGateway } from '../gateway/streaming.gateway';

interface TriggerContext {
  streamId?: string;
  deviceId?: string;
  message: string;
  extra?: Record<string, unknown>;
}

interface EventFilters {
  ruleId?: string;
  streamId?: string;
  acknowledged?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(AlertRule)
    private readonly ruleRepo: Repository<AlertRule>,
    @InjectRepository(AlertEvent)
    private readonly eventRepo: Repository<AlertEvent>,
    @Inject(forwardRef(() => StreamingGateway))
    private readonly gateway: StreamingGateway,
  ) {}

  findAllRules(filters?: { enabled?: boolean; severity?: string }): Promise<AlertRule[]> {
    const qb = this.ruleRepo.createQueryBuilder('r').orderBy('r.createdAt', 'DESC');

    if (filters?.enabled !== undefined) {
      qb.andWhere('r.enabled = :enabled', { enabled: filters.enabled });
    }
    if (filters?.severity) {
      qb.andWhere('r.severity = :severity', { severity: filters.severity });
    }

    return qb.getMany();
  }

  async findOneRule(id: string): Promise<AlertRule> {
    const rule = await this.ruleRepo.findOne({ where: { id } });
    if (!rule) throw new NotFoundException(`Regla de alerta ${id} no encontrada`);
    return rule;
  }

  async createRule(dto: CreateAlertRuleDto, userId: string): Promise<AlertRule> {
    const rule = this.ruleRepo.create({
      name: dto.name,
      description: dto.description,
      streamId: dto.streamId ?? null,
      deviceId: dto.deviceId ?? null,
      condition: dto.condition,
      params: dto.params ?? {},
      action: dto.action,
      actionTarget: dto.actionTarget ?? null,
      enabled: dto.enabled ?? true,
      severity: dto.severity,
      cooldownSeconds: dto.cooldownSeconds ?? 60,
      createdBy: { id: userId } as User,
    });
    return this.ruleRepo.save(rule);
  }

  async updateRule(id: string, dto: UpdateAlertRuleDto): Promise<AlertRule> {
    const rule = await this.findOneRule(id);

    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.description !== undefined) rule.description = dto.description;
    if (dto.streamId !== undefined) rule.streamId = dto.streamId ?? null;
    if (dto.deviceId !== undefined) rule.deviceId = dto.deviceId ?? null;
    if (dto.condition !== undefined) rule.condition = dto.condition;
    if (dto.params !== undefined) rule.params = dto.params ?? {};
    if (dto.action !== undefined) rule.action = dto.action;
    if (dto.actionTarget !== undefined) rule.actionTarget = dto.actionTarget ?? null;
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;
    if (dto.severity !== undefined) rule.severity = dto.severity;
    if (dto.cooldownSeconds !== undefined) rule.cooldownSeconds = dto.cooldownSeconds;

    return this.ruleRepo.save(rule);
  }

  async deleteRule(id: string): Promise<void> {
    const rule = await this.findOneRule(id);
    await this.ruleRepo.remove(rule);
  }

  findEvents(filters: EventFilters): Promise<AlertEvent[]> {
    const limit = Math.min(filters.limit ?? 50, 200);
    const qb = this.eventRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.rule', 'rule')
      .orderBy('e.triggeredAt', 'DESC')
      .take(limit);

    if (filters.ruleId) {
      qb.andWhere('e.ruleId = :ruleId', { ruleId: filters.ruleId });
    }
    if (filters.streamId) {
      qb.andWhere('e.streamId = :streamId', { streamId: filters.streamId });
    }
    if (filters.acknowledged !== undefined) {
      qb.andWhere('e.acknowledged = :acknowledged', { acknowledged: filters.acknowledged });
    }
    if (filters.from) {
      qb.andWhere('e.triggeredAt >= :from', { from: filters.from });
    }
    if (filters.to) {
      qb.andWhere('e.triggeredAt <= :to', { to: filters.to });
    }

    return qb.getMany();
  }

  async acknowledgeEvent(eventId: string, userId: string): Promise<AlertEvent> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException(`Evento de alerta ${eventId} no encontrado`);

    event.acknowledged = true;
    event.acknowledgedAt = new Date();
    event.acknowledgedBy = userId;
    return this.eventRepo.save(event);
  }

  async triggerAlert(ruleId: string, ctx: TriggerContext): Promise<AlertEvent | null> {
    const rule = await this.ruleRepo.findOne({ where: { id: ruleId } });
    if (!rule || !rule.enabled) return null;

    // Cooldown check
    if (rule.lastTriggeredAt) {
      const nextAllowed = new Date(rule.lastTriggeredAt.getTime() + rule.cooldownSeconds * 1000);
      if (new Date() < nextAllowed) {
        this.logger.debug(`[ALERT] Regla ${rule.name} en cooldown, omitiendo`);
        return null;
      }
    }

    const alertEvent = this.eventRepo.create({
      rule: { id: ruleId } as AlertRule,
      ruleId,
      streamId: ctx.streamId ?? null,
      deviceId: ctx.deviceId ?? null,
      message: ctx.message,
      context: ctx.extra ?? {},
      severity: rule.severity,
    });

    const saved = await this.eventRepo.save(alertEvent);

    rule.lastTriggeredAt = new Date();
    await this.ruleRepo.save(rule);

    const levelMap: Record<string, 'info' | 'warning' | 'critical'> = {
      low: 'info',
      medium: 'warning',
      high: 'critical',
      critical: 'critical',
    };

    this.gateway.emitAlert({
      id: saved.id,
      level: levelMap[rule.severity] ?? 'warning',
      category: 'stream',
      title: rule.name,
      message: ctx.message,
      timestamp: saved.triggeredAt.toISOString(),
    });

    this.logger.log(`[ALERT] Disparada: ${rule.name} | evento: ${saved.id}`);
    return saved;
  }
}
