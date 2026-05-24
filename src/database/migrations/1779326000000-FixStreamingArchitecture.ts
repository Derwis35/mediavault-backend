import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixStreamingArchitecture1779326000000 implements MigrationInterface {
  name = 'FixStreamingArchitecture1779326000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE streams
        ADD COLUMN IF NOT EXISTS source_type    VARCHAR NOT NULL DEFAULT 'wowza',
        ADD COLUMN IF NOT EXISTS stream_path    VARCHAR NULL,
        ADD COLUMN IF NOT EXISTS input_protocol VARCHAR NULL,
        ADD COLUMN IF NOT EXISTS device_id      UUID NULL REFERENCES devices(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE devices
        DROP COLUMN IF EXISTS source_type,
        DROP COLUMN IF EXISTS stream_path,
        DROP COLUMN IF EXISTS input_protocol,
        DROP COLUMN IF EXISTS wowza_stream_name
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE devices
        ADD COLUMN IF NOT EXISTS wowza_stream_name VARCHAR NULL,
        ADD COLUMN IF NOT EXISTS source_type       VARCHAR NOT NULL DEFAULT 'wowza',
        ADD COLUMN IF NOT EXISTS stream_path       VARCHAR NULL,
        ADD COLUMN IF NOT EXISTS input_protocol    VARCHAR NULL
    `);
    await queryRunner.query(`
      ALTER TABLE streams
        DROP COLUMN IF EXISTS device_id,
        DROP COLUMN IF EXISTS input_protocol,
        DROP COLUMN IF EXISTS stream_path,
        DROP COLUMN IF EXISTS source_type
    `);
  }
}
