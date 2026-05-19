export enum StreamTransportProtocol {
  TCP = 'tcp',
  UDP = 'udp',
}

export enum VideoCodecStrategy {
  COPY = 'copy',
  H264 = 'libx264',
  H265 = 'libx265',
}

export enum AudioCodecStrategy {
  COPY = 'copy',
  AAC = 'aac',
  NONE = 'none',
}

export interface RTSPCameraConfig {
  streamId: string;
  streamName: string;
  rtspUrl: string;
  wowzaAppName: string;
  transport: StreamTransportProtocol;
  videoCodec: VideoCodecStrategy;
  audioCodec: AudioCodecStrategy;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  ffmpegExtraArgs?: string[];
}
