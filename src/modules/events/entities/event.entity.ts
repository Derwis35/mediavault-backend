import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Stream } from '../../streams/entities/stream.entity';
import { Evidence } from '../../evidences/entities/evidence.entity';
import { User } from '../../users/entities/user.entity';

export enum EventStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  ARCHIVED = 'archived'
}

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: EventStatus, default: EventStatus.OPEN })
  status!: EventStatus;

  @Column({ nullable: true })
  location?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @ManyToOne(() => User, (user) => user.events)
  createdBy!: User;

  @ManyToMany(() => Stream, (stream) => stream.events)
  @JoinTable({ name: 'event_streams' })
  streams!: Stream[];

  @OneToMany(() => Evidence, (evidence) => evidence.event)
  evidences!: Evidence[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
