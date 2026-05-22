import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCanManagePermissions1779314005000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`UPDATE roles SET permissions = permissions || '{"canManagePermissions": true}'::jsonb WHERE name IN ('admin','superadmin') AND permissions IS NOT NULL`);
    await qr.query(`UPDATE roles SET permissions = permissions || '{"canManagePermissions": false}'::jsonb WHERE name NOT IN ('admin','superadmin') AND permissions IS NOT NULL`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`UPDATE roles SET permissions = permissions - 'canManagePermissions'`);
  }
}
