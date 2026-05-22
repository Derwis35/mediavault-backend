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

export enum DeviceStatus {
  REGISTERED = 'REGISTERED',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 200 })
  name!: string;

  @Column({ unique: true, length: 100 })
  serial!: string;

  @Column({ nullable: true, length: 100 })
  type?: string;

  @Column({ name: 'wowza_stream_name', length: 200 })
  wowzaStreamName!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  assignedUser?: User | null;

  @Column({
    type: 'enum',
    enum: DeviceStatus,
    default: DeviceStatus.REGISTERED,
  })
  status!: DeviceStatus;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude?: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude?: number | null;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt?: Date | null;

  @Column({ name: 'last_seen', type: 'timestamptz', nullable: true })
  lastSeen?: Date | null;

  @Column({ name: 'quadrant_id', type: 'uuid', nullable: true })
  quadrantId?: string | null;

  @Column({ name: 'zone_id', type: 'uuid', nullable: true })
  zoneId?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
