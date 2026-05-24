import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RetentionLog } from '../retention/entities/retention-log.entity';
import { Evidence } from '../evidences/entities/evidence.entity';
import {
  PaginatedReportResponse,
  ReportActiveItemDto,
  ReportDeletedItemDto,
  ReportSummaryDto,
} from './dto/report-response.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(RetentionLog)
    private readonly retentionLogRepo: Repository<RetentionLog>,
    @InjectRepository(Evidence)
    private readonly evidenceRepo: Repository<Evidence>,
  ) {}

  async getSummary(from: Date, to: Date): Promise<ReportSummaryDto> {
    const [uploaded] = (await this.evidenceRepo.query(
      `SELECT
         COUNT(*)::int                                        AS total,
         COUNT(*) FILTER (WHERE file_type = 'video')::int    AS videos,
         COUNT(*) FILTER (WHERE file_type = 'image')::int    AS images
       FROM evidences
       WHERE created_at >= $1 AND created_at <= $2 AND deleted_at IS NULL`,
      [from, to],
    )) as Array<{ total: number; videos: number; images: number }>;

    const [deleted] = (await this.retentionLogRepo.query(
      `SELECT
         COUNT(*)::int                                        AS total,
         COUNT(*) FILTER (WHERE file_type = 'video')::int    AS videos,
         COUNT(*) FILTER (WHERE file_type = 'image')::int    AS images,
         COALESCE(SUM(file_size_bytes), 0)::text             AS bytes_freed
       FROM retention_logs
       WHERE deleted_at >= $1 AND deleted_at <= $2`,
      [from, to],
    )) as Array<{ total: number; videos: number; images: number; bytes_freed: string }>;

    const [current] = (await this.evidenceRepo.query(
      `SELECT COALESCE(SUM(file_size_bytes), 0)::text AS current_bytes
       FROM evidences
       WHERE deleted_at IS NULL`,
    )) as Array<{ current_bytes: string }>;

    return {
      totalUploaded: uploaded.total,
      totalUploadedVideos: uploaded.videos,
      totalUploadedImages: uploaded.images,
      totalAutoDeleted: deleted.total,
      totalAutoDeletedVideos: deleted.videos,
      totalAutoDeletedImages: deleted.images,
      storageBytesFreed: deleted.bytes_freed,
      storageCurrentBytes: current.current_bytes,
    };
  }

  async getDeleted(
    from: Date,
    to: Date,
    clasificacionId?: string,
    page = 1,
    limit = 25,
  ): Promise<PaginatedReportResponse<ReportDeletedItemDto>> {
    const qb = this.retentionLogRepo
      .createQueryBuilder('rl')
      .where('rl.deletedAt >= :from', { from })
      .andWhere('rl.deletedAt <= :to', { to });

    if (clasificacionId) {
      qb.andWhere(
        'rl.clasificacionName = (SELECT name FROM clasificaciones WHERE id = :clasificacionId)',
        { clasificacionId },
      );
    }

    qb.orderBy('rl.deletedAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items.map((r) => ({
        id: r.id,
        evidenceId: r.evidenceId,
        fileName: r.fileName,
        fileType: r.fileType,
        clasificacionName: r.clasificacionName,
        etiquetaName: r.etiquetaName,
        retentionDays: r.retentionDays,
        expiresAt: r.expiresAt.toISOString(),
        deletedAt: r.deletedAt.toISOString(),
        fileSizeBytes: r.fileSizeBytes,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getActive(
    from: Date,
    to: Date,
    clasificacionId?: string,
    etiquetaId?: string,
    fileType?: string,
    page = 1,
    limit = 25,
  ): Promise<PaginatedReportResponse<ReportActiveItemDto>> {
    const qb = this.evidenceRepo
      .createQueryBuilder('ev')
      .leftJoinAndSelect('ev.etiqueta', 'et')
      .leftJoinAndSelect('et.clasificacion', 'cl')
      .where('ev.createdAt >= :from', { from })
      .andWhere('ev.createdAt <= :to', { to });

    if (clasificacionId) {
      qb.andWhere('cl.id = :clasificacionId', { clasificacionId });
    }

    if (etiquetaId) {
      qb.andWhere('et.id = :etiquetaId', { etiquetaId });
    }

    if (fileType) {
      qb.andWhere('ev.fileType = :fileType', { fileType });
    }

    qb.orderBy('ev.expiresAt', 'ASC', 'NULLS LAST')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const now = Date.now();

    return {
      data: items.map((ev) => ({
        id: ev.id,
        fileName: path.basename(ev.storagePath),
        fileType: ev.fileType ?? null,
        etiquetaName: ev.etiqueta?.name ?? null,
        clasificacionName: ev.etiqueta?.clasificacion?.name ?? null,
        clasificacionColor: ev.etiqueta?.clasificacion?.color ?? null,
        expiresAt: ev.expiresAt?.toISOString() ?? null,
        diasRestantes: ev.expiresAt
          ? Math.ceil((ev.expiresAt.getTime() - now) / 86_400_000)
          : null,
        fileSizeBytes: ev.fileSizeBytes,
        createdAt: ev.createdAt.toISOString(),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getExpiringSoon(days = 7): Promise<ReportActiveItemDto[]> {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + days);

    const items = await this.evidenceRepo
      .createQueryBuilder('ev')
      .leftJoinAndSelect('ev.etiqueta', 'et')
      .leftJoinAndSelect('et.clasificacion', 'cl')
      .where('ev.expiresAt IS NOT NULL')
      .andWhere('ev.expiresAt >= :from', { from })
      .andWhere('ev.expiresAt <= :to', { to })
      .orderBy('ev.expiresAt', 'ASC')
      .getMany();

    const now = Date.now();
    return items.map((ev) => ({
      id: ev.id,
      fileName: path.basename(ev.storagePath),
      fileType: ev.fileType ?? null,
      etiquetaName: ev.etiqueta?.name ?? null,
      clasificacionName: ev.etiqueta?.clasificacion?.name ?? null,
      clasificacionColor: ev.etiqueta?.clasificacion?.color ?? null,
      expiresAt: ev.expiresAt!.toISOString(),
      diasRestantes: Math.ceil((ev.expiresAt!.getTime() - now) / 86_400_000),
      fileSizeBytes: ev.fileSizeBytes,
      createdAt: ev.createdAt.toISOString(),
    }));
  }

  async exportCsv(from: Date, to: Date): Promise<string> {
    const items = await this.retentionLogRepo
      .createQueryBuilder('rl')
      .where('rl.deletedAt >= :from', { from })
      .andWhere('rl.deletedAt <= :to', { to })
      .orderBy('rl.deletedAt', 'DESC')
      .getMany();

    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const header =
      'Archivo,Tipo,Clasificación,Etiqueta,Retención(días),Expiró,Eliminado,Tamaño(bytes)';

    const rows = items.map((r) =>
      [
        r.fileName,
        r.fileType,
        r.clasificacionName,
        r.etiquetaName,
        r.retentionDays,
        r.expiresAt.toISOString(),
        r.deletedAt.toISOString(),
        r.fileSizeBytes,
      ]
        .map(escape)
        .join(','),
    );

    return [header, ...rows].join('\n');
  }
}
