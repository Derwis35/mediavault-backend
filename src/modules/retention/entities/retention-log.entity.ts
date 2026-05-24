import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('retention_logs')
export class RetentionLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'evidence_id' })
  evidenceId!: string;

  @Column({ name: 'file_name' })
  fileName!: string;

  @Column({ name: 'file_type' })
  fileType!: string;

  @Column({ name: 'file_size_bytes', type: 'bigint', default: 0 })
  fileSizeBytes!: string;

  @Column({ name: 'etiqueta_name' })
  etiquetaName!: string;

  @Column({ name: 'clasificacion_name' })
  clasificacionName!: string;

  @Column({ name: 'retention_days', type: 'int' })
  retentionDays!: number;

  @Column({ name: 'stream_id', type: 'varchar', nullable: true })
  streamId?: string | null;

  @Column({ name: 'operator_id', type: 'varchar', nullable: true })
  operatorId?: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'deleted_at' })
  deletedAt!: Date;
}
