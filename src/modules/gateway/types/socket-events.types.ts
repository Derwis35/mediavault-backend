export enum ServerToClientEvents {
  STREAM_STATUS_CHANGED   = 'stream:statusChanged',
  STREAM_CONNECTED        = 'stream:connected',
  STREAM_DISCONNECTED     = 'stream:disconnected',
  STREAM_ERROR            = 'stream:error',
  STREAM_RECONNECTING     = 'stream:reconnecting',
  STREAM_METRICS_UPDATE   = 'stream:metricsUpdate',
  EVIDENCE_CREATED        = 'evidence:created',
  EVIDENCE_VERIFIED       = 'evidence:verified',
  ALERT_NEW               = 'alert:new',
  ALERT_RESOLVED          = 'alert:resolved',
  INGESTION_STARTED       = 'ingestion:started',
  INGESTION_STOPPED       = 'ingestion:stopped',
  INGESTION_RECONNECTING  = 'ingestion:reconnecting',
  INGESTION_MAX_RETRIES   = 'ingestion:maxRetriesReached',
  SERVER_STATUS           = 'server:status',
  CONNECTED_CLIENTS       = 'server:connectedClients',
}

export enum ClientToServerEvents {
  SUBSCRIBE_STREAM        = 'subscribe:stream',
  UNSUBSCRIBE_STREAM      = 'unsubscribe:stream',
  SUBSCRIBE_ALL_STREAMS   = 'subscribe:allStreams',
  REQUEST_STATUS          = 'request:status',
}
