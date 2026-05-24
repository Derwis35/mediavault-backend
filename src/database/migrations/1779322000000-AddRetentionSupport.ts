import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetentionSupport1779322000000 implements MigrationInterface {
  name = 'AddRetentionSupport1779322000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE evidences
        ADD COLUMN IF NOT EXISTS etiqueta_assigned_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS file_type VARCHAR NULL
    `);

    await queryRunner.query(`
      CREATE TABLE retention_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        evidence_id VARCHAR NOT NULL,
        file_name VARCHAR NOT NULL,
        file_type VARCHAR NOT NULL,
        file_size_bytes BIGINT NOT NULL DEFAULT 0,
        etiqueta_name VARCHAR NOT NULL,
        clasificacion_name VARCHAR NOT NULL,
        retention_days INTEGER NOT NULL,
        stream_id VARCHAR NULL,
        operator_id VARCHAR NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS retention_logs`);
    await queryRunner.query(`
      ALTER TABLE evidences
        DROP COLUMN IF EXISTS file_type,
        DROP COLUMN IF EXISTS etiqueta_assigned_at
    `);
  }
}
