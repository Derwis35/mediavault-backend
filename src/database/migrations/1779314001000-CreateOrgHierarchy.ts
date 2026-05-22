import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrgHierarchy1779314001000 implements MigrationInterface {
  name = 'CreateOrgHierarchy1779314001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "org_countries" (
        "id"         UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "name"       VARCHAR(150) NOT NULL,
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_org_countries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "org_states" (
        "id"         UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "name"       VARCHAR(150) NOT NULL,
        "country_id" UUID         NOT NULL,
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_org_states" PRIMARY KEY ("id"),
        CONSTRAINT "FK_org_states_country" FOREIGN KEY ("country_id")
          REFERENCES "org_countries"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "org_municipalities" (
        "id"       UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "name"     VARCHAR(150) NOT NULL,
        "state_id" UUID         NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_org_municipalities" PRIMARY KEY ("id"),
        CONSTRAINT "FK_org_municipalities_state" FOREIGN KEY ("state_id")
          REFERENCES "org_states"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "org_zones" (
        "id"              UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "name"            VARCHAR(150) NOT NULL,
        "municipality_id" UUID         NOT NULL,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_org_zones" PRIMARY KEY ("id"),
        CONSTRAINT "FK_org_zones_municipality" FOREIGN KEY ("municipality_id")
          REFERENCES "org_municipalities"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "org_quadrants" (
        "id"      UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "name"    VARCHAR(150) NOT NULL,
        "zone_id" UUID         NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_org_quadrants" PRIMARY KEY ("id"),
        CONSTRAINT "FK_org_quadrants_zone" FOREIGN KEY ("zone_id")
          REFERENCES "org_zones"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_org_states_country_id" ON "org_states" ("country_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_org_municipalities_state_id" ON "org_municipalities" ("state_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_org_zones_municipality_id" ON "org_zones" ("municipality_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_org_quadrants_zone_id" ON "org_quadrants" ("zone_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_org_quadrants_zone_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_org_zones_municipality_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_org_municipalities_state_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_org_states_country_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "org_quadrants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "org_zones"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "org_municipalities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "org_states"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "org_countries"`);
  }
}
