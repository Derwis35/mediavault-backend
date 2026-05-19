export interface StreamStatusPayload {
  streamId: string;
  streamName: string;
  previousStatus: string;
  currentStatus: string;
  isLiveInWowza: boolean;
  timestamp: string;
}

export interface StreamMetricsPayload {
  streamId: string;
  streamName: string;
  uplinkBandwidth: number;
  downlinkBandwidth: number;
  activeConnections: number;
  frameRate?: number;
  bitrate?: number;
  timestamp: string;
}

export interface AlertPayload {
  id: string;
  level: 'info' | 'warning' | 'critical';
  category: 'stream' | 'ingestion' | 'auth' | 'system';
  title: string;
  message: string;
  streamId?: string;
  timestamp: string;
  autoResolveMs?: number;
}

export interface IngestionStatusPayload {
  streamId: string;
  streamName: string;
  status: string;
  reconnectAttempts?: number;
  lastError?: string;
  timestamp: string;
}

export interface ServerStatusPayload {
  wowzaOnline: boolean;
  wowzaVersion?: string;
  totalStreams: number;
  activeStreams: number;
  totalConnections: number;
  connectedClients: number;
  timestamp: string;
}
