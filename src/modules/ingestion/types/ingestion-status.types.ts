export enum IngestionStatus {
  STARTING = 'starting',
  RUNNING = 'running',
  RECONNECTING = 'reconnecting',
  STOPPED = 'stopped',
  ERROR = 'error',
  MAX_RETRIES = 'max_retries_reached',
}

export interface IngestionProcessState {
  streamId: string;
  streamName: string;
  status: IngestionStatus;
  pid?: number;
  startedAt?: Date;
  reconnectAttempts: number;
  lastError?: string;
  lastErrorAt?: Date;
  bytesProcessed?: number;
  ffmpegCommand?: string;
}

export interface IngestionSummary {
  total: number;
  running: number;
  reconnecting: number;
  error: number;
  processes: IngestionProcessState[];
}
