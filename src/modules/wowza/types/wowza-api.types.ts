export interface WowzaTokenResponse {
  token: string;
  expiresAt: string;
}

export interface WowzaStreamInfo {
  appName: string;
  streamName: string;
  status: string;
}
