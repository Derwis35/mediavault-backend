import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCoordinatesToDevice1779311950438 implements MigrationInterface {
  name = 'AddCoordinatesToDevice1779311950438';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "latitude" NUMERIC(10,7) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "longitude" NUMERIC(10,7) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "longitude"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "latitude"`);
  }
}
