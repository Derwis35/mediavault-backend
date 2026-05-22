import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrgFieldsToUsers1779316000000 implements MigrationInterface {
  name = 'AddOrgFieldsToUsers1779316000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "zone_id" UUID NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "quadrant_id" UUID NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "quadrant_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "zone_id"`,
    );
  }
}
