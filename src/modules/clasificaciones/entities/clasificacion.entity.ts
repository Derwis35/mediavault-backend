import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Etiqueta } from './etiqueta.entity';

@Entity('clasificaciones')
export class Clasificacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ name: 'retention_days', type: 'int', nullable: true })
  retentionDays!: number | null;

  @Column({ default: '#6366f1' })
  color!: string;

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @OneToMany(() => Etiqueta, (etiqueta) => etiqueta.clasificacion)
  etiquetas!: Etiqueta[];

  etiquetasCount?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
