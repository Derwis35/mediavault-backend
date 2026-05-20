import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WowzaServer } from './entities/wowza-server.entity';
import { WowzaServersService } from './wowza-servers.service';
import { WowzaServersController } from './wowza-servers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WowzaServer])],
  controllers: [WowzaServersController],
  providers: [WowzaServersService],
  exports: [TypeOrmModule, WowzaServersService],
})
export class WowzaServersModule {}
