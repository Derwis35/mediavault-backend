import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateWowzaServers1779216627936 implements MigrationInterface {
  name = 'CreateWowzaServers1779216627936';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'wowza_servers',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'name', type: 'varchar', isNullable: false },
          { name: 'ip', type: 'varchar', isNullable: false },
          { name: 'port_stream', type: 'int', default: 1935 },
          { name: 'port_hls', type: 'int', default: 8088 },
          { name: 'port_api', type: 'int', default: 8087 },
          { name: 'app_name', type: 'varchar', isNullable: false },
          { name: 'api_user', type: 'varchar', isNullable: false },
          { name: 'api_password', type: 'varchar', isNullable: false },
          { name: 'go2rtc_url', type: 'varchar', isNullable: true },
          { name: 'is_default', type: 'boolean', default: false },
          { name: 'is_active', type: 'boolean', default: true },
          { name: 'last_tested_at', type: 'timestamptz', isNullable: true },
          { name: 'last_test_ok', type: 'boolean', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true, // ifNotExists
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('wowza_servers', true);
  }
}
