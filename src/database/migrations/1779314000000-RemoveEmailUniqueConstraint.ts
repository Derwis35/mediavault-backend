import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveEmailUniqueConstraint1779314000000 implements MigrationInterface {
  name = 'RemoveEmailUniqueConstraint1779314000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminar constraint único de email — regla de negocio: varios usuarios pueden compartir email corporativo
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_users_email";
      EXCEPTION WHEN others THEN NULL; END $$
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_users_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_97672ac88f789774dd47f7c8be"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email" ON "users" ("email")`);
  }
}
