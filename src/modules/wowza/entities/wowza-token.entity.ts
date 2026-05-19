import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm';
import { Session } from '../../auth/entities/session.entity';
import { Stream } from '../../streams/entities/stream.entity';

@Entity('wowza_tokens')
export class WowzaToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Session)
  @JoinColumn({ name: 'session_id' })
  session!: Session;

  @ManyToOne(() => Stream)
  @JoinColumn({ name: 'stream_id' })
  stream!: Stream;

  @Column({ name: 'token_hash' })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
