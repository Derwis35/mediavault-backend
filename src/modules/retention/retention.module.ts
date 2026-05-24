import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetentionLog } from './entities/retention-log.entity';
import { Evidence } from '../evidences/entities/evidence.entity';
import { Etiqueta } from '../clasificaciones/entities/etiqueta.entity';
import { Clasificacion } from '../clasificaciones/entities/clasificacion.entity';
import { RetentionTask } from './retention.task';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RetentionLog, Evidence, Etiqueta, Clasificacion]),
    AuditModule,
  ],
  providers: [RetentionTask],
})
export class RetentionModule {}
