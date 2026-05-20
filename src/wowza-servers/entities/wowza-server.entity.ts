import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encrypt, decrypt } from '../utils/encryption';

@Entity('wowza_servers')
export class WowzaServer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column()
  ip!: string;

  @Column({ name: 'port_stream', default: 1935 })
  portStream!: number;

  @Column({ name: 'port_hls', default: 8088 })
  portHls!: number;

  @Column({ name: 'port_api', default: 8087 })
  portApi!: number;

  @Column({ name: 'app_name' })
  appName!: string;

  @Column({ name: 'api_user' })
  apiUser!: string;

  @Column({
    name: 'api_password',
    transformer: {
      to: (value: string) => encrypt(value),
      from: (value: string) => decrypt(value),
    },
  })
  apiPassword!: string;

  @Column({ name: 'go2rtc_url', nullable: true })
  go2rtcUrl?: string;

  @Column({ name: 'is_default', default: false })
  isDefault!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'last_tested_at', type: 'timestamptz', nullable: true })
  lastTestedAt?: Date;

  @Column({ name: 'last_test_ok', nullable: true })
  lastTestOk?: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
