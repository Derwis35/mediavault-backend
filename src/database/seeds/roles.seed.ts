import 'dotenv/config';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { RoleName } from '../../modules/users/entities/role.entity';

const srcDir = path.join(__dirname, '..', '..');

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres',
  database: process.env.DB_NAME || 'mediavault',
  ssl: process.env.DB_SSL === 'true',
  entities: [
    `${srcDir}/modules/**/*.entity.{ts,js}`,
    `${srcDir}/wowza-servers/**/*.entity.{ts,js}`,
  ],
  synchronize: false,
  logging: false,
});

const seedRoles = async () => {
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  const roles = [
    { name: RoleName.ADMIN, description: 'Administrador del sistema', permissions: {} },
    { name: RoleName.SUPERVISOR, description: 'Supervisor de operación', permissions: {} },
    { name: RoleName.OPERATOR, description: 'Operador de evidencia', permissions: {} },
    { name: RoleName.VIEWER, description: 'Usuario de solo lectura', permissions: {} },
  ];

  await Promise.all(
    roles.map((role) =>
      dataSource
        .createQueryBuilder()
        .insert()
        .into('roles')
        .values(role)
        .orIgnore()
        .execute(),
    ),
  );
  console.log('Roles seeded');

  await dataSource.destroy();
};

seedRoles().catch((error) => {
  console.error('Seed error:', error);
  process.exit(1);
});
