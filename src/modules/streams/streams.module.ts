import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreamsController } from './streams.controller';
import { StreamsService } from './streams.service';
import { Stream } from './entities/stream.entity';
import { User } from '../users/entities/user.entity';
import { WowzaModule } from '../wowza/wowza.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { AuditModule } from '../audit/audit.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Stream, User]),
    WowzaModule,
    IngestionModule,
    AuditModule,
    forwardRef(() => GatewayModule),
  ],
  controllers: [StreamsController],
  providers: [StreamsService],
  exports: [StreamsService],
})
export class StreamsModule {}
