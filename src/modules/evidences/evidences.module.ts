import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvidencesController } from './evidences.controller';
import { EvidencesService } from './evidences.service';
import { EvidencesStorageService } from './evidences-storage.service';
import { EvidencesIntegrityService } from './evidences-integrity.service';
import { EvidencesExportService } from './evidences-export.service';
import { Evidence } from './entities/evidence.entity';
import { Stream } from '../streams/entities/stream.entity';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Evidence, Stream, Event, User]),
    AuditModule,
    GatewayModule,
  ],
  controllers: [EvidencesController],
  providers: [
    EvidencesService,
    EvidencesStorageService,
    EvidencesIntegrityService,
    EvidencesExportService,
  ],
  exports: [EvidencesService],
})
export class EvidencesModule {}
