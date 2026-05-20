import 'dotenv/config';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { RoleName } from '../../modules/users/entities/role.entity';
import { DEFAULT_PERMISSIONS } from '../../modules/users/interfaces/role-permissions.interface';

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

  const roleRepo = dataSource.getRepository('roles');

  const roles = [
    { name: RoleName.ADMIN, description: 'Administrador del sistema' },
    { name: RoleName.SUPERVISOR, description: 'Supervisor de operación' },
    { name: RoleName.OPERATOR, description: 'Operador de evidencia' },
    { name: RoleName.VIEWER, description: 'Usuario de solo lectura' },
  ];

  for (const roleDef of roles) {
    const existing = await roleRepo.findOne({ where: { name: roleDef.name } });
    const permissions = DEFAULT_PERMISSIONS[roleDef.name] ?? {};

    if (existing) {
      const isEmpty =
        !existing.permissions || Object.keys(existing.permissions as object).length === 0;
      if (isEmpty) {
        await roleRepo.update({ name: roleDef.name }, { permissions });
        console.log(`Updated permissions for: ${roleDef.name}`);
      }
    } else {
      await roleRepo.save({ ...roleDef, permissions });
      console.log(`Created role: ${roleDef.name}`);
    }
  }

  console.log('Roles seeded');
  await dataSource.destroy();
};

seedRoles().catch((error) => {
  console.error('Seed error:', error);
  process.exit(1);
});
