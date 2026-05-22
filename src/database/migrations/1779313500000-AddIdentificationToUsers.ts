import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdentificationToUsers1779313500000 implements MigrationInterface {
  name = 'AddIdentificationToUsers1779313500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "id_type" VARCHAR(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "id_number" VARCHAR(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cargo" VARCHAR(150)`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_id_number"
        ON "users" ("id_number")
        WHERE "id_number" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_id_number"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "cargo"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "id_number"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "id_type"`);
  }
}
