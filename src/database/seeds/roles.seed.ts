import { DataSource } from 'typeorm';
import 'dotenv/config';
import ormconfig from '../../../ormconfig';
import { RoleName } from '../../modules/users/entities/role.entity';

const seedRoles = async () => {
  const dataSource = ormconfig as DataSource;

  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  const roles = [
    { name: RoleName.ADMIN, description: 'Administrador del sistema', permissions: {} },
    { name: RoleName.SUPERVISOR, description: 'Supervisor de operación', permissions: {} },
    { name: RoleName.OPERATOR, description: 'Operador de evidencia', permissions: {} },
    { name: RoleName.VIEWER, description: 'Usuario de solo lectura', permissions: {} }
  ];

  await Promise.all(
    roles.map(async (role) => {
      await dataSource.createQueryBuilder().insert().into('roles').values(role).orIgnore().execute();
    })
  );

  await dataSource.destroy();
};

seedRoles().catch((error) => {
  console.error('Seed error:', error);
  process.exit(1);
});
