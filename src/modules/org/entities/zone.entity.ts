import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Municipality } from './municipality.entity';

@Entity('org_zones')
export class Zone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 150 })
  name!: string;

  @ManyToOne(() => Municipality, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'municipality_id' })
  municipality!: Municipality;

  @Column({ name: 'municipality_id', type: 'varchar' })
  municipalityId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
