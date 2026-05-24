import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetentionLog } from '../retention/entities/retention-log.entity';
import { Evidence } from '../evidences/entities/evidence.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([RetentionLog, Evidence])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
