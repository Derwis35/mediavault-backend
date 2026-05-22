import {
  Column,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  CreateDateColumn
} from 'typeorm';
import { Role } from './role.entity';
import { Session } from '../../auth/entities/session.entity';
import { Stream } from '../../streams/entities/stream.entity';
import { Evidence } from '../../evidences/entities/evidence.entity';
import { Event } from '../../events/entities/event.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ name: 'first_name' })
  firstName!: string;

  @Column({ name: 'last_name' })
  lastName!: string;

  @Column({ name: 'id_type', type: 'varchar', length: 20, nullable: true })
  idType?: 'cedula' | 'placa' | 'codigo_unico' | null;

  @Column({ name: 'id_number', type: 'varchar', length: 20, nullable: true, unique: true })
  idNumber?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  cargo?: string | null;

  @Column({ name: 'zone_id', type: 'uuid', nullable: true })
  zoneId?: string | null;

  @Column({ name: 'quadrant_id', type: 'uuid', nullable: true })
  quadrantId?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @OneToMany(() => Session, (session) => session.user)
  sessions!: Session[];

  @OneToMany(() => Stream, (stream) => stream.createdBy)
  streams!: Stream[];

  @OneToMany(() => Evidence, (evidence) => evidence.uploadedBy)
  evidences!: Evidence[];

  @OneToMany(() => Event, (event) => event.createdBy)
  events!: Event[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
