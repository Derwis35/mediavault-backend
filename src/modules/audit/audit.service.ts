import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditFiltersDto } from './dto/audit-filters.dto';
import { ActionSummary, AuditLogEntry, CreateAuditEntry } from './dto/audit-response.dto';

const CSV_MAX_ROWS = 10_000;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  // ─── Fire-and-forget entry point ──────────────────────────────────────────

  async log(entry: CreateAuditEntry): Promise<void> {
    try {
      await this.auditLogRepository.save({
        action: entry.action,
        entityType: entry.entityType ?? '',
        entityId: entry.entityId,
        userId: entry.userId,
        ipAddress: entry.ipAddress,
        metadata: entry.metadata ?? {},
      });
    } catch {
      this.logger.warn(`Audit log failed: ${entry.action}`);
    }
  }

  // ─── Backward-compatible wrapper ──────────────────────────────────────────

  async findByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    try {
      return await this.auditLogRepository.find({
        where: { entityType, entityId },
        order: { createdAt: 'ASC' },
        take: 100,
      });
    } catch {
      this.logger.warn(`Could not retrieve audit trail for ${entityType}/${entityId}`);
      return [];
    }
  }

  async logAction(
    action: string,
    entityType: string,
    entityId?: string,
    userId?: string,
    ipAddress?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.log({ action, entityType, entityId, userId, ipAddress, metadata });
  }

  // ─── Paginated query ──────────────────────────────────────────────────────

  async findAll(
    filters: AuditFiltersDto,
  ): Promise<{ items: AuditLogEntry[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const qb = this.auditLogRepository
      .createQueryBuilder('al')
      .orderBy('al.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.userId) {
      qb.andWhere('al.userId = :userId', { userId: filters.userId });
    }
    if (filters.action) {
      qb.andWhere('al.action = :action', { action: filters.action });
    }
    if (filters.entityType) {
      qb.andWhere('al.entityType = :entityType', { entityType: filters.entityType });
    }
    if (filters.entityId) {
      qb.andWhere('al.entityId = :entityId', { entityId: filters.entityId });
    }
    if (filters.ipAddress) {
      qb.andWhere('al.ipAddress = :ipAddress', { ipAddress: filters.ipAddress });
    }
    if (filters.fromDate || filters.toDate) {
      const fromDate = filters.fromDate ? new Date(filters.fromDate) : new Date(0);
      const toDate = filters.toDate ? new Date(filters.toDate) : new Date();
      qb.andWhere('al.createdAt BETWEEN :fromDate AND :toDate', { fromDate, toDate });
    }

    const [logs, total] = await qb.getManyAndCount();

    return {
      items: logs.map(this.toEntry),
      total,
      page,
      limit,
    };
  }

  async findByUser(userId: string, limit = 100): Promise<AuditLogEntry[]> {
    const logs = await this.auditLogRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return logs.map(this.toEntry);
  }

  async getActionSummary(fromDate?: string, toDate?: string): Promise<ActionSummary[]> {
    const qb = this.auditLogRepository
      .createQueryBuilder('al')
      .select('al.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .groupBy('al.action')
      .orderBy('count', 'DESC');

    if (fromDate || toDate) {
      const from = fromDate ? new Date(fromDate) : new Date(0);
      const to = toDate ? new Date(toDate) : new Date();
      qb.where('al.createdAt BETWEEN :from AND :to', { from, to });
    }

    const rows = await qb.getRawMany<{ action: string; count: string }>();
    return rows.map((r) => ({ action: r.action, count: Number(r.count) }));
  }

  async exportToCsv(filters: AuditFiltersDto): Promise<string> {
    const qb = this.auditLogRepository
      .createQueryBuilder('al')
      .orderBy('al.createdAt', 'DESC');

    if (filters.userId) {
      qb.andWhere('al.userId = :userId', { userId: filters.userId });
    }
    if (filters.action) {
      qb.andWhere('al.action = :action', { action: filters.action });
    }
    if (filters.entityType) {
      qb.andWhere('al.entityType = :entityType', { entityType: filters.entityType });
    }
    if (filters.entityId) {
      qb.andWhere('al.entityId = :entityId', { entityId: filters.entityId });
    }
    if (filters.ipAddress) {
      qb.andWhere('al.ipAddress = :ipAddress', { ipAddress: filters.ipAddress });
    }
    if (filters.fromDate || filters.toDate) {
      const fromDate = filters.fromDate ? new Date(filters.fromDate) : new Date(0);
      const toDate = filters.toDate ? new Date(filters.toDate) : new Date();
      qb.andWhere('al.createdAt BETWEEN :fromDate AND :toDate', { fromDate, toDate });
    }

    const rows = await qb.getMany();

    if (rows.length > CSV_MAX_ROWS) {
      throw new BadRequestException(
        `El filtro retorna ${rows.length} filas. El máximo para exportación es ${CSV_MAX_ROWS}. Aplica filtros más específicos.`,
      );
    }

    const header = 'id,timestamp,user_id,action,entity_type,entity_id,ip_address,metadata';
    const lines = rows.map((r) => {
      const metadata = r.metadata ? JSON.stringify(r.metadata).replace(/"/g, '""') : '';
      return [
        r.id,
        r.createdAt.toISOString(),
        r.userId ?? '',
        r.action,
        r.entityType ?? '',
        r.entityId ?? '',
        r.ipAddress ?? '',
        `"${metadata}"`,
      ].join(',');
    });

    return [header, ...lines].join('\n');
  }

  private toEntry(log: AuditLog): AuditLogEntry {
    return {
      id: log.id,
      userId: log.userId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      ipAddress: log.ipAddress,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    };
  }
}
