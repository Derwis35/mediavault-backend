import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSourceTypeToDevices1779324000000 implements MigrationInterface {
  name = 'AddSourceTypeToDevices1779324000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE devices
        ADD COLUMN IF NOT EXISTS source_type    VARCHAR NOT NULL DEFAULT 'wowza',
        ADD COLUMN IF NOT EXISTS stream_path    VARCHAR NULL,
        ADD COLUMN IF NOT EXISTS input_protocol VARCHAR NULL
    `);
    await queryRunner.query(`
      ALTER TABLE devices ALTER COLUMN wowza_stream_name DROP NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE devices ALTER COLUMN wowza_stream_name SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE devices
        DROP COLUMN IF EXISTS input_protocol,
        DROP COLUMN IF EXISTS stream_path,
        DROP COLUMN IF EXISTS source_type
    `);
  }
}
