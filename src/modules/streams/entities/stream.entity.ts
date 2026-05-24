import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Event } from '../../events/entities/event.entity';
import { Evidence } from '../../evidences/entities/evidence.entity';
import { Device } from '../../devices/entities/device.entity';

export enum StreamStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  CONNECTING = 'connecting',
}

export enum StreamProtocol {
  HLS = 'HLS',
  DASH = 'DASH',
  WebRTC = 'WebRTC',
  RTMP = 'RTMP',
  RTSP = 'RTSP',
  SRT = 'SRT',
}

@Entity('streams')
export class Stream {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ name: 'wowza_app_name' })
  wowzaAppName!: string;

  @Column({ name: 'wowza_stream_name' })
  wowzaStreamName!: string;

  @Column({ name: 'source_type', type: 'varchar', default: 'wowza' })
  sourceType!: string;

  @Column({ name: 'stream_path', type: 'varchar', nullable: true })
  streamPath?: string | null;

  @Column({ name: 'input_protocol', type: 'varchar', nullable: true })
  inputProtocol?: string | null;

  @Column({ name: 'device_id', type: 'uuid', nullable: true, insert: false, update: false })
  deviceId?: string | null;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'device_id' })
  device?: Device | null;

  @Column({ name: 'source_url', nullable: true })
  sourceUrl?: string;

  @Column({ type: 'enum', enum: StreamProtocol })
  protocol!: StreamProtocol;

  @Column({ type: 'enum', enum: StreamStatus, default: StreamStatus.INACTIVE })
  status!: StreamStatus;

  @Column({ nullable: true })
  location?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @ManyToOne(() => User, (user) => user.streams)
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User;

  @ManyToMany(() => Event, (event) => event.streams)
  @JoinTable({ name: 'event_streams' })
  events!: Event[];

  @OneToMany(() => Evidence, (evidence) => evidence.stream)
  evidences!: Evidence[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
