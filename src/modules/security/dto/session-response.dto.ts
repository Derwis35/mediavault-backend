import { AuditLogEntry } from '../../audit/dto/audit-response.dto';

export interface SessionResponseDto {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  role: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: string;
  createdAt: string;
  auditEntries?: AuditLogEntry[];
  isBlacklisted?: boolean;
}

export interface AnomalyReport {
  type: string;
  level: 'info' | 'warning' | 'critical';
  userId?: string;
  description: string;
  occurrences: number;
  detectedAt: string;
}
