import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAlertTables1779312761643 implements MigrationInterface {
  name = 'CreateAlertTables1779312761643';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "alert_condition_enum" AS ENUM (
          'stream_down', 'reconnecting', 'no_signal', 'high_latency', 'motion_detected', 'custom'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "alert_action_enum" AS ENUM (
          'notification', 'email', 'webhook', 'record'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "alert_severity_enum" AS ENUM (
          'low', 'medium', 'high', 'critical'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "alert_rules" (
        "id"                UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "name"              VARCHAR(200) NOT NULL,
        "description"       TEXT,
        "stream_id"         UUID,
        "device_id"         UUID,
        "condition"         "alert_condition_enum" NOT NULL,
        "params"            JSONB       NOT NULL DEFAULT '{}',
        "action"            "alert_action_enum" NOT NULL DEFAULT 'notification',
        "action_target"     TEXT,
        "enabled"           BOOLEAN     NOT NULL DEFAULT TRUE,
        "severity"          "alert_severity_enum" NOT NULL DEFAULT 'medium',
        "cooldown_seconds"  INTEGER     NOT NULL DEFAULT 60,
        "last_triggered_at" TIMESTAMPTZ,
        "created_by_id"     UUID,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_alert_rules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_alert_rules_created_by" FOREIGN KEY ("created_by_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "alert_events" (
        "id"               UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "rule_id"          UUID        NOT NULL,
        "stream_id"        UUID,
        "device_id"        UUID,
        "message"          TEXT        NOT NULL,
        "context"          JSONB       NOT NULL DEFAULT '{}',
        "severity"         "alert_severity_enum" NOT NULL DEFAULT 'medium',
        "acknowledged"     BOOLEAN     NOT NULL DEFAULT FALSE,
        "acknowledged_at"  TIMESTAMPTZ,
        "acknowledged_by"  UUID,
        "triggered_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_alert_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_alert_events_rule" FOREIGN KEY ("rule_id")
          REFERENCES "alert_rules"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_alert_events_rule_id" ON "alert_events" ("rule_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_alert_events_triggered_at" ON "alert_events" ("triggered_at" DESC)`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_alert_rules_enabled" ON "alert_rules" ("enabled")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_alert_rules_enabled"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_alert_events_triggered_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_alert_events_rule_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "alert_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "alert_rules"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "alert_severity_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "alert_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "alert_condition_enum"`);
  }
}
