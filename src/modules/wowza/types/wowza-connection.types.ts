export interface WowzaConnection {
  id: string;
  applicationName: string;
  ipAddress: string;
  connectedAt: string;
  protocol: string;
  sessionId: string;
  bytesIn: number;
  bytesOut: number;
  streamName: string;
}

export interface WowzaConnectionSummary {
  total: number;
  byApplication: Record<string, number>;
  byProtocol: Record<string, number>;
  connections: WowzaConnection[];
}
