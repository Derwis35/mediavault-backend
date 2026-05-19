import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSecurityIndexes1747267200000 implements MigrationInterface {
  name = 'AddSecurityIndexes1747267200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // audit_logs indexes
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_user_id" ON "audit_logs" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_action" ON "audit_logs" ("action")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_entity" ON "audit_logs" ("entity_type", "entity_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_created_at" ON "audit_logs" ("created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_ip" ON "audit_logs" ("ip_address")`,
    );

    // sessions indexes
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sessions_user_id" ON "sessions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sessions_expires_at" ON "sessions" ("expires_at")`,
    );

    // Evidence soft-delete column (from EvidencesModule)
    await queryRunner.query(
      `ALTER TABLE "evidences" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_entity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_ip"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sessions_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sessions_expires_at"`);
    await queryRunner.query(`ALTER TABLE "evidences" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
