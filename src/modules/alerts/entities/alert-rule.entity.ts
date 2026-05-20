import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum AlertCondition {
  STREAM_DOWN = 'stream_down',
  RECONNECTING = 'reconnecting',
  NO_SIGNAL = 'no_signal',
  HIGH_LATENCY = 'high_latency',
  MOTION_DETECTED = 'motion_detected',
  CUSTOM = 'custom',
}

export enum AlertAction {
  NOTIFICATION = 'notification',
  EMAIL = 'email',
  WEBHOOK = 'webhook',
  RECORD = 'record',
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

@Entity('alert_rules')
export class AlertRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 200 })
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ name: 'stream_id', type: 'varchar', nullable: true })
  streamId?: string | null;

  @Column({ name: 'device_id', type: 'varchar', nullable: true })
  deviceId?: string | null;

  @Column({ type: 'enum', enum: AlertCondition })
  condition!: AlertCondition;

  @Column({ type: 'jsonb', default: {} })
  params!: Record<string, unknown>;

  @Column({ type: 'enum', enum: AlertAction, default: AlertAction.NOTIFICATION })
  action!: AlertAction;

  @Column({ name: 'action_target', type: 'varchar', nullable: true })
  actionTarget?: string | null;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: 'enum', enum: AlertSeverity, default: AlertSeverity.MEDIUM })
  severity!: AlertSeverity;

  @Column({ name: 'cooldown_seconds', default: 60 })
  cooldownSeconds!: number;

  @Column({ name: 'last_triggered_at', type: 'timestamptz', nullable: true })
  lastTriggeredAt?: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
