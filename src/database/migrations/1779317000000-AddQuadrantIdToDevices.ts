import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuadrantIdToDevices1779317000000 implements MigrationInterface {
  name = 'AddQuadrantIdToDevices1779317000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "quadrant_id" UUID NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "devices" DROP COLUMN IF EXISTS "quadrant_id"`,
    );
  }
}
