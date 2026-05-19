import { AnomalyReport } from './session-response.dto';

export interface SecurityReportDto {
  activeSessions: number;
  activeSessionsByRole: {
    admin: number;
    supervisor: number;
    operator: number;
    viewer: number;
  };
  failedLoginsLast24h: number;
  uniqueActiveIps: number;
  anomalies: AnomalyReport[];
  wowzaTokensActive: number;
  lastAuditEntry: Record<string, unknown> | null;
  generatedAt: string;
}
