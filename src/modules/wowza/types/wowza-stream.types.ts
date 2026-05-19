export interface WowzaStream {
  id: string;
  name: string;
  applicationName: string;
  streamFile: string;
  serverName: string;
  isConnected: boolean;
  isRunning: boolean;
  uplinkBandwidth: number;
  downlinkBandwidth: number;
  bytesIn: number;
  bytesOut: number;
  packetLossPercentage: number;
  connectTime: string;
  sourceIp: string;
  sourcePort: number;
  codec: {
    videoCodec: string;
    audioCodec: string;
    width: number;
    height: number;
    frameRate: number;
    bitrate: number;
  };
}

export interface WowzaStreamList {
  incomingStreams: WowzaStream[];
}

export interface WowzaStreamCreateRequest {
  incomingStream: {
    name: string;
  };
}

export interface WowzaPlaybackUrls {
  hls: string;
  llHls: string;
  dash: string;
  webrtc: string;
  rtmp: string;
}
