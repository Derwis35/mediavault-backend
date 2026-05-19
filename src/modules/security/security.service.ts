import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Session } from '../auth/entities/session.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../redis/redis.service';
import { StreamingGateway } from '../gateway/streaming.gateway';
import { SessionResponseDto, AnomalyReport } from './dto/session-response.dto';
import { SecurityReportDto } from './dto/security-report.dto';
import { AuditLogEntry } from '../audit/dto/audit-response.dto';

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
    private readonly gateway: StreamingGateway,
  ) {}

  async getActiveSessions(filters?: {
    userId?: string;
    role?: string;
    fromDate?: string;
  }): Promise<SessionResponseDto[]> {
    const qb = this.sessionRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'user')
      .leftJoinAndSelect('user.role', 'role')
      .where('s.expiresAt > :now', { now: new Date() })
      .orderBy('s.createdAt', 'DESC');

    if (filters?.userId) {
      qb.andWhere('user.id = :userId', { userId: filters.userId });
    }
    if (filters?.role) {
      qb.andWhere('role.name = :role', { role: filters.role });
    }
    if (filters?.fromDate) {
      qb.andWhere('s.createdAt >= :fromDate', { fromDate: new Date(filters.fromDate) });
    }

    const sessions = await qb.getMany();
    return sessions.map((s) => this.toDto(s));
  }

  async getSessionDetail(sessionId: string): Promise<SessionResponseDto> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['user', 'user.role'],
    });

    if (!session) throw new NotFoundException('Sesión no encontrada');

    const auditLogs = await this.auditLogRepository.find({
      where: { userId: session.user.id },
      order: { createdAt: 'ASC' },
      take: 100,
    });

    const isBlacklisted = await this.redisService.exists(`blacklist:${session.tokenHash}`);

    const auditEntries: AuditLogEntry[] = auditLogs.map((e) => ({
      id: e.id,
      userId: e.userId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      ipAddress: e.ipAddress,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
    }));

    return { ...this.toDto(session), auditEntries, isBlacklisted };
  }

  async revokeSession(sessionId: string, adminUserId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['user'],
    });

    if (!session) throw new NotFoundException('Sesión no encontrada');

    const ttlSeconds = Math.max(0, Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000));
    if (ttlSeconds > 0) {
      await this.redisService.set(`blacklist:${session.tokenHash}`, '1', ttlSeconds);
    }

    await this.sessionRepository.delete({ id: sessionId });

    await this.auditService.logAction(
      'SESSION_REVOKED_BY_ADMIN',
      'Session',
      sessionId,
      adminUserId,
      undefined,
      { revokedSessionId: sessionId, targetUserId: session.user.id },
    );

    this.gateway.emitAlert({
      id: randomUUID(),
      level: 'warning',
      category: 'auth',
      title: 'Sesión revocada',
      message: 'Sesión revocada por administrador',
      timestamp: new Date().toISOString(),
    });
  }

  async revokeAllUserSessions(targetUserId: string, adminUserId: string): Promise<number> {
    const sessions = await this.sessionRepository.find({
      where: { user: { id: targetUserId }, expiresAt: MoreThan(new Date()) },
    });

    await Promise.all(
      sessions.map(async (s) => {
        const ttl = Math.max(0, Math.ceil((s.expiresAt.getTime() - Date.now()) / 1000));
        if (ttl > 0) {
          await this.redisService.set(`blacklist:${s.tokenHash}`, '1', ttl);
        }
      }),
    );

    if (sessions.length > 0) {
      await this.sessionRepository.delete({ user: { id: targetUserId } });
    }

    await this.auditService.logAction(
      'ALL_SESSIONS_REVOKED',
      'User',
      targetUserId,
      adminUserId,
      undefined,
      { targetUserId, count: sessions.length },
    );

    return sessions.length;
  }

  async detectAnomalies(): Promise<AnomalyReport[]> {
    const anomalies: AnomalyReport[] = [];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Anomaly 1: Multiple failed logins from same IP in 1h
    try {
      const rows = await this.auditLogRepository
        .createQueryBuilder('al')
        .select('al.userId', 'userId')
        .addSelect('al.ipAddress', 'ipAddress')
        .addSelect('COUNT(*)', 'occurrences')
        .where("al.action = 'LOGIN_FAILED'")
        .andWhere('al.createdAt > :oneHourAgo', { oneHourAgo })
        .groupBy('al.userId')
        .addGroupBy('al.ipAddress')
        .having('COUNT(*) > 5')
        .getRawMany<{ userId: string; ipAddress: string; occurrences: string }>();

      for (const row of rows) {
        anomalies.push({
          type: 'MULTIPLE_FAILED_LOGINS',
          level: 'warning',
          userId: row.userId,
          description: `Múltiples intentos de login fallidos desde IP ${row.ipAddress}`,
          occurrences: Number(row.occurrences),
          detectedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      this.logger.warn('detectAnomalies: failed login check failed');
    }

    // Anomaly 4: Mass evidence downloads in 1h (> 20)
    try {
      const rows = await this.auditLogRepository
        .createQueryBuilder('al')
        .select('al.userId', 'userId')
        .addSelect('COUNT(*)', 'occurrences')
        .where("al.action = 'EVIDENCE_DOWNLOADED'")
        .andWhere('al.createdAt > :oneHourAgo', { oneHourAgo })
        .groupBy('al.userId')
        .having('COUNT(*) > 20')
        .getRawMany<{ userId: string; occurrences: string }>();

      for (const row of rows) {
        anomalies.push({
          type: 'MASS_EVIDENCE_DOWNLOAD',
          level: 'critical',
          userId: row.userId,
          description: `Descarga masiva de evidencias: ${row.occurrences} en 1h`,
          occurrences: Number(row.occurrences),
          detectedAt: new Date().toISOString(),
        });
      }
    } catch {
      this.logger.warn('detectAnomalies: mass download check failed');
    }

    // Anomaly 3: After-hours access (00:00 – 05:00 UTC)
    try {
      const rows = await this.auditLogRepository
        .createQueryBuilder('al')
        .select('al.userId', 'userId')
        .addSelect('COUNT(*)', 'occurrences')
        .where('al.createdAt > :oneDayAgo', { oneDayAgo })
        .andWhere("EXTRACT(HOUR FROM al.createdAt) BETWEEN 0 AND 4")
        .groupBy('al.userId')
        .getRawMany<{ userId: string; occurrences: string }>();

      for (const row of rows) {
        anomalies.push({
          type: 'AFTER_HOURS_ACCESS',
          level: 'info',
          userId: row.userId,
          description: 'Acceso detectado fuera de horario laboral (00:00–05:00 UTC)',
          occurrences: Number(row.occurrences),
          detectedAt: new Date().toISOString(),
        });
      }
    } catch {
      this.logger.warn('detectAnomalies: after-hours check failed');
    }

    // Anomaly 2: Login from new/multiple IPs in 24h
    try {
      const recentLogins = await this.auditLogRepository.find({
        where: { action: 'LOGIN', createdAt: MoreThan(oneDayAgo) },
        select: ['userId', 'ipAddress'],
      });

      const userIpMap = new Map<string, Set<string>>();
      for (const entry of recentLogins) {
        if (!entry.userId || !entry.ipAddress) continue;
        if (!userIpMap.has(entry.userId)) userIpMap.set(entry.userId, new Set());
        userIpMap.get(entry.userId)!.add(entry.ipAddress);
      }

      for (const [userId, ips] of userIpMap) {
        if (ips.size > 1) {
          anomalies.push({
            type: 'LOGIN_NEW_IP',
            level: 'info',
            userId,
            description: `Login desde ${ips.size} IPs distintas en las últimas 24h`,
            occurrences: ips.size,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    } catch {
      this.logger.warn('detectAnomalies: new IP check failed');
    }

    return anomalies;
  }

  async getSecurityReport(): Promise<SecurityReportDto> {
    const now = new Date();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const activeSessions = await this.sessionRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'user')
      .leftJoinAndSelect('user.role', 'role')
      .where('s.expiresAt > :now', { now })
      .getMany();

    const activeSessionsByRole = { admin: 0, supervisor: 0, operator: 0, viewer: 0 };
    const uniqueIps = new Set<string>();

    for (const s of activeSessions) {
      const roleName = s.user?.role?.name as keyof typeof activeSessionsByRole | undefined;
      if (roleName && roleName in activeSessionsByRole) {
        activeSessionsByRole[roleName]++;
      }
      if (s.ipAddress) uniqueIps.add(s.ipAddress);
    }

    const failedLoginsLast24h = await this.auditLogRepository.count({
      where: { action: 'LOGIN_FAILED', createdAt: MoreThan(oneDayAgo) },
    });

    const wowzaTokensActive = await this.redisService.countKeys('wowza_token:*');

    const [lastAuditEntry = null] = await this.auditLogRepository.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });

    const anomalies = await this.detectAnomalies();

    return {
      activeSessions: activeSessions.length,
      activeSessionsByRole,
      failedLoginsLast24h,
      uniqueActiveIps: uniqueIps.size,
      anomalies,
      wowzaTokensActive,
      lastAuditEntry: lastAuditEntry as unknown as Record<string, unknown> | null,
      generatedAt: now.toISOString(),
    };
  }

  private toDto(session: Session): SessionResponseDto {
    return {
      id: session.id,
      userId: session.user.id,
      userEmail: session.user.email,
      userName: `${session.user.firstName} ${session.user.lastName}`,
      role: session.user.role?.name ?? '',
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
    };
  }
}
