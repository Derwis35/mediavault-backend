import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClasificacionesEtiquetas1779320000000 implements MigrationInterface {
  name = 'CreateClasificacionesEtiquetas1779320000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE clasificaciones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR NOT NULL UNIQUE,
        retention_days INTEGER NULL,
        color VARCHAR NOT NULL DEFAULT '#6366f1',
        is_system BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE etiquetas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR NOT NULL,
        description TEXT NULL,
        clasificacion_id UUID NOT NULL REFERENCES clasificaciones(id),
        is_system BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE evidences
        ADD COLUMN IF NOT EXISTS etiqueta_id UUID NULL REFERENCES etiquetas(id),
        ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE evidences
        DROP COLUMN IF EXISTS expires_at,
        DROP COLUMN IF EXISTS etiqueta_id
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS etiquetas`);
    await queryRunner.query(`DROP TABLE IF EXISTS clasificaciones`);
  }
}
