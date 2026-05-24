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
import { Etiqueta } from '../../clasificaciones/entities/etiqueta.entity';

export enum EvidenceType {
  VIDEO = 'video',
  PHOTO = 'photo',
  SNAPSHOT = 'snapshot',
  DVR_CLIP = 'dvr_clip',
}

export enum EvidenceFileType {
  VIDEO = 'video',
  IMAGE = 'image',
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

  @Column({ name: 'file_type', type: 'varchar', nullable: true })
  fileType?: EvidenceFileType | null;

  @Column({ name: 'etiqueta_id', type: 'uuid', nullable: true, insert: false, update: false })
  etiquetaId!: string | null;

  @ManyToOne(() => Etiqueta, { nullable: true, eager: false })
  @JoinColumn({ name: 'etiqueta_id' })
  etiqueta?: Etiqueta | null;

  @Column({ name: 'etiqueta_assigned_at', type: 'timestamptz', nullable: true })
  etiquetaAssignedAt?: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
