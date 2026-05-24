import 'dotenv/config';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { RoleName } from '../../modules/users/entities/role.entity';
import { DEFAULT_PERMISSIONS } from '../../modules/users/interfaces/role-permissions.interface';
import { seedAdmin } from './admin.seed';

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

const runSeeds = async () => {
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  const roleDefs = [
    { name: RoleName.ADMIN, description: 'Administrador del sistema' },
    { name: RoleName.SUPERVISOR, description: 'Supervisor de operación' },
    { name: RoleName.OPERATOR, description: 'Operador de evidencia' },
    { name: RoleName.VIEWER, description: 'Usuario de solo lectura' },
  ];

  // Deduplicate roles: keep one row per name, reassign users, then delete extras
  const keepIds: Record<string, string> = {};
  for (const name of [RoleName.ADMIN, RoleName.SUPERVISOR, RoleName.OPERATOR, RoleName.VIEWER]) {
    const rows: Array<{ id: string }> = await dataSource.query(
      `SELECT id FROM roles WHERE name = $1 ORDER BY (permissions::text != '{}') DESC, id LIMIT 1`,
      [name],
    );
    if (rows[0]) keepIds[name] = rows[0].id;
  }
  // Reassign users to the kept role ID, then delete duplicates
  for (const [name, keepId] of Object.entries(keepIds)) {
    await dataSource.query(
      `UPDATE users SET role_id = $1 WHERE role_id IN (SELECT id FROM roles WHERE name = $2 AND id != $1)`,
      [keepId, name],
    );
    await dataSource.query(`DELETE FROM roles WHERE name = $1 AND id != $2`, [name, keepId]);
  }

  const roleRepo = dataSource.getRepository('roles');
  for (const roleDef of roleDefs) {
    const permissions = DEFAULT_PERMISSIONS[roleDef.name] ?? {};
    const existing = await roleRepo.findOne({ where: { name: roleDef.name } });
    if (existing) {
      await roleRepo.update({ name: roleDef.name }, { permissions });
    } else {
      await roleRepo.save({ ...roleDef, permissions });
    }
  }
  console.log('Roles seeded');

  await seedAdmin(dataSource);

  // Seed clasificaciones del sistema
  const clasificacionDefs = [
    { name: 'Retención Indefinida', retentionDays: null, color: '#6b7280' },
    { name: 'RUTINA',         retentionDays: 60,   color: '#f59e0b' },
  ];

  for (const def of clasificacionDefs) {
    const existing = await dataSource.query(
      `SELECT id FROM clasificaciones WHERE name = $1`,
      [def.name],
    ) as Array<{ id: string }>;

    if (existing.length === 0) {
      await dataSource.query(
        `INSERT INTO clasificaciones (name, retention_days, color, is_system, is_active)
         VALUES ($1, $2, $3, true, true)`,
        [def.name, def.retentionDays, def.color],
      );
    }
  }

  // Etiqueta RUTINA bajo clasificación RUTINA
  const [rutinaClasif] = await dataSource.query(
    `SELECT id FROM clasificaciones WHERE name = 'RUTINA'`,
  ) as Array<{ id: string }>;

  if (rutinaClasif) {
    const etiquetaExistente = await dataSource.query(
      `SELECT id FROM etiquetas WHERE name = 'RUTINA' AND clasificacion_id = $1`,
      [rutinaClasif.id],
    ) as Array<{ id: string }>;

    if (etiquetaExistente.length === 0) {
      await dataSource.query(
        `INSERT INTO etiquetas (name, description, clasificacion_id, is_system, is_active)
         VALUES ('RUTINA', 'Video de actividad rutinaria', $1, true, true)`,
        [rutinaClasif.id],
      );
    }
  }
  console.log('Clasificaciones y etiquetas seeded');

  await dataSource.destroy();
  console.log('All seeds completed successfully');
};

runSeeds().catch((err: unknown) => {
  console.error('Seed error:', err);
  process.exit(1);
});
