import * as path from 'path';
import * as fs from 'fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Evidence, EvidenceType } from '../evidences/entities/evidence.entity';
import { RetentionLog } from './entities/retention-log.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RetentionTask {
  private readonly logger = new Logger(RetentionTask.name);
  private readonly storagePath: string;

  constructor(
    @InjectRepository(Evidence)
    private readonly evidenceRepo: Repository<Evidence>,
    @InjectRepository(RetentionLog)
    private readonly retentionLogRepo: Repository<RetentionLog>,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    this.storagePath = this.configService.get<string>('STORAGE_PATH') ?? './storage';
  }

  @Cron('0 3 * * *')
  async runRetentionPurge(): Promise<void> {
    this.logger.log('Starting daily retention purge');

    const expired = await this.evidenceRepo
      .createQueryBuilder('ev')
      .leftJoinAndSelect('ev.etiqueta', 'et')
      .leftJoinAndSelect('et.clasificacion', 'cl')
      .leftJoinAndSelect('ev.stream', 'stream')
      .leftJoinAndSelect('ev.uploadedBy', 'uploadedBy')
      .where('ev.expires_at IS NOT NULL')
      .andWhere('ev.expires_at <= NOW()')
      .getMany();

    let total = 0;
    let totalBytes = BigInt(0);
    let errors = 0;

    for (const evidence of expired) {
      try {
        const fileType =
          evidence.fileType ??
          (evidence.type === EvidenceType.PHOTO || evidence.type === EvidenceType.SNAPSHOT
            ? 'image'
            : 'video');

        await this.retentionLogRepo.save({
          evidenceId: evidence.id,
          fileName: path.basename(evidence.storagePath),
          fileType,
          fileSizeBytes: evidence.fileSizeBytes,
          etiquetaName: evidence.etiqueta?.name ?? '',
          clasificacionName: evidence.etiqueta?.clasificacion?.name ?? '',
          retentionDays: evidence.etiqueta?.clasificacion?.retentionDays ?? 0,
          streamId: evidence.stream?.id ?? null,
          operatorId: evidence.uploadedBy?.id ?? null,
          expiresAt: evidence.expiresAt!,
        });

        const absolutePath = path.join(this.storagePath, evidence.storagePath);
        try {
          await fs.unlink(absolutePath);
        } catch (unlinkErr) {
          this.logger.error(`Failed to delete file ${absolutePath}: ${String(unlinkErr)}`);
        }

        await this.evidenceRepo.delete(evidence.id);

        total++;
        totalBytes += BigInt(evidence.fileSizeBytes || '0');
      } catch (err) {
        this.logger.error(`Error purging evidence ${evidence.id}: ${String(err)}`);
        errors++;
      }
    }

    await this.auditService.logAction(
      'RETENTION_PURGE',
      'System',
      'retention-purge',
      'system',
      undefined,
      { total, totalBytes: totalBytes.toString(), errors },
    );

    this.logger.log(
      `Retention purge completed: ${total} evidences purged, ${totalBytes} bytes freed, ${errors} errors`,
    );
  }
}
