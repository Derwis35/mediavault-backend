import 'dotenv/config';
import ormconfig from '../../../ormconfig';
import { DataSource } from 'typeorm';
import { RoleName } from '../../modules/users/entities/role.entity';
import { seedAdmin } from './admin.seed';

const runSeeds = async () => {
  const dataSource = ormconfig as DataSource;

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

  await seedAdmin(dataSource);

  await dataSource.destroy();
  console.log('All seeds completed successfully');
};

runSeeds().catch((err: unknown) => {
  console.error('Seed error:', err);
  process.exit(1);
});
