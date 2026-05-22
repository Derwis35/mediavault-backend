import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddZoneIdToDevices1779314002000 implements MigrationInterface {
  async up(qr: QueryRunner) {
    await qr.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS zone_id UUID`);
  }

  async down(qr: QueryRunner) {
    await qr.query(`ALTER TABLE devices DROP COLUMN IF EXISTS zone_id`);
  }
}
