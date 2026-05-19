import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm';
import { Stream } from '../../streams/entities/stream.entity';
import { Event } from '../../events/entities/event.entity';
import { User } from '../../users/entities/user.entity';

export enum EvidenceType {
  VIDEO = 'video',
  PHOTO = 'photo',
  SNAPSHOT = 'snapshot',
  DVR_CLIP = 'dvr_clip',
}

@Entity('evidences')
export class Evidence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Stream, (stream) => stream.evidences, { nullable: true })
  @JoinColumn({ name: 'stream_id' })
  stream?: Stream;

  @ManyToOne(() => Event, (event) => event.evidences, { nullable: true })
  @JoinColumn({ name: 'event_id' })
  event?: Event;

  @Column({ type: 'enum', enum: EvidenceType })
  type!: EvidenceType;

  @Column({ name: 'storage_path' })
  storagePath!: string;

  @Column({ name: 'hash_sha256' })
  hashSha256!: string;

  @Column({ name: 'file_size_bytes', type: 'bigint' })
  fileSizeBytes!: string;

  @Column({ name: 'duration_seconds', type: 'int', nullable: true })
  durationSeconds?: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ name: 'recorded_at', type: 'timestamptz', nullable: true })
  recordedAt?: Date;

  @ManyToOne(() => User, (user) => user.evidences)
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy!: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
