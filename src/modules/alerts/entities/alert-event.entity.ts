import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AlertRule, AlertSeverity } from './alert-rule.entity';

@Entity('alert_events')
export class AlertEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => AlertRule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule!: AlertRule;

  @Column({ name: 'rule_id', type: 'varchar' })
  ruleId!: string;

  @Column({ name: 'stream_id', type: 'varchar', nullable: true })
  streamId?: string | null;

  @Column({ name: 'device_id', type: 'varchar', nullable: true })
  deviceId?: string | null;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', default: {} })
  context!: Record<string, unknown>;

  @Column({ type: 'enum', enum: AlertSeverity, default: AlertSeverity.MEDIUM })
  severity!: AlertSeverity;

  @Column({ default: false })
  acknowledged!: boolean;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt?: Date | null;

  @Column({ name: 'acknowledged_by', type: 'varchar', nullable: true })
  acknowledgedBy?: string | null;

  @CreateDateColumn({ name: 'triggered_at' })
  triggeredAt!: Date;
}
