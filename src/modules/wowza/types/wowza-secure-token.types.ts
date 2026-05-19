import { WowzaPlaybackUrls } from './wowza-stream.types';

export interface WowzaSecureTokenParams {
  streamName: string;
  appName: string;
  clientIp?: string;
  ttlSeconds?: number;
}

export interface WowzaSecureToken {
  streamId: string;
  appName: string;
  streamName: string;
  playbackUrls: WowzaPlaybackUrls;
  expiresAt: string;
  tokenHash: string;
}
