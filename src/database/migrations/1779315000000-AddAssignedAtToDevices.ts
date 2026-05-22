import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssignedAtToDevices1779315000000 implements MigrationInterface {
  name = 'AddAssignedAtToDevices1779315000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devices"
      ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "assigned_at"`);
  }
}
