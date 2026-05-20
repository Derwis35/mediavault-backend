import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum RoleName {
  ADMIN = 'admin',
  SUPERVISOR = 'supervisor',
  OPERATOR = 'operator',
  VIEWER = 'viewer'
}

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: RoleName, unique: true })
  name!: RoleName;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'jsonb', nullable: true })
  permissions?: Record<string, unknown>;
}
