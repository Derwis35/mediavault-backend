import { MigrationInterface, QueryRunner } from 'typeorm';

export class RolesFlexible1779314003000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE roles ALTER COLUMN name TYPE VARCHAR(50) USING name::text`);
    await qr.query(`DROP TYPE IF EXISTS roles_name_enum`);
    await qr.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false`);
    await qr.query(`UPDATE roles SET is_system = true WHERE name IN ('admin','supervisor','operator','viewer')`);
    await qr.query(`UPDATE roles SET permissions = permissions || '{"canDownloadReports": true}'::jsonb WHERE name = 'admin' AND permissions IS NOT NULL`);
    await qr.query(`UPDATE roles SET permissions = permissions || '{"canDownloadReports": false}'::jsonb WHERE name != 'admin' AND permissions IS NOT NULL`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE roles DROP COLUMN IF EXISTS is_system`);
  }
}
