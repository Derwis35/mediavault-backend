import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from './src/modules/users/entities/user.entity';
import { Role } from './src/modules/users/entities/role.entity';
import { Session } from './src/modules/auth/entities/session.entity';
import { Stream } from './src/modules/streams/entities/stream.entity';
import { Evidence } from './src/modules/evidences/entities/evidence.entity';
import { Event } from './src/modules/events/entities/event.entity';
import { AuditLog } from './src/modules/audit/entities/audit-log.entity';
import { WowzaToken } from './src/modules/wowza/entities/wowza-token.entity';

const host = process.env.DB_HOST || 'localhost';
const port = Number(process.env.DB_PORT || 5432);
const username = process.env.DB_USER || 'postgres';
const password = process.env.DB_PASS || 'postgres';
const database = process.env.DB_NAME || 'mediavault';

export default new DataSource({
  type: 'postgres',
  host,
  port,
  username,
  password,
  database,
  ssl: process.env.NODE_ENV === 'production',
  entities: ['src/modules/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: false
});
