import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { WowzaPlaybackUrls } from './types/wowza-stream.types';
import { WowzaSecureToken, WowzaSecureTokenParams } from './types/wowza-secure-token.types';
import { WowzaService } from './wowza.service';

@Injectable()
export class WowzaSecureTokenService {
  private readonly logger = new Logger(WowzaSecureTokenService.name);

  constructor(
    private readonly wowzaService: WowzaService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async generateSecureToken(
    params: WowzaSecureTokenParams,
    sessionId: string,
    streamId?: string,
  ): Promise<WowzaSecureToken> {
    const startTime = Math.floor(Date.now() / 1000);
    const ttlSeconds = params.ttlSeconds ?? 1800;
    const endTime = startTime + ttlSeconds;
    const secret = this.configService.get<string>('wowza.secureTokenSecret') || '';
    const clientIp = params.clientIp ?? '';

    const hashString = `${params.streamName}-${startTime}-${endTime}-${clientIp}-${secret}`;
    const tokenHash = createHash('sha256').update(hashString).digest('hex');

    const baseUrls = this.wowzaService.buildPlaybackUrls(params.appName, params.streamName);
    const tokenQs = `wowzaTokenStartTime=${startTime}&wowzaTokenEndTime=${endTime}&wowzaTokenHash=${tokenHash}`;

    const appendQs = (url: string): string =>
      url.includes('?') ? `${url}&${tokenQs}` : `${url}?${tokenQs}`;

    const playbackUrls: WowzaPlaybackUrls = {
      hls: appendQs(baseUrls.hls),
      llHls: appendQs(baseUrls.llHls),
      dash: appendQs(baseUrls.dash),
      webrtc: appendQs(baseUrls.webrtc),
      rtmp: appendQs(baseUrls.rtmp),
    };

    const expiresAt = new Date(endTime * 1000).toISOString();
    const tokenStreamId = streamId ?? params.streamName;

    await this.redisService.set(
      `wowza_token:${tokenStreamId}:${sessionId}`,
      JSON.stringify({ tokenHash, expiresAt, streamName: params.streamName, appName: params.appName }),
      ttlSeconds + 60,
    );

    this.logger.log(`Generated secure token for stream ${params.streamName} session ${sessionId}`);

    return {
      streamId: tokenStreamId,
      appName: params.appName,
      streamName: params.streamName,
      playbackUrls,
      expiresAt,
      tokenHash,
    };
  }

  async revokeToken(streamId: string, sessionId: string): Promise<void> {
    await this.redisService.del(`wowza_token:${streamId}:${sessionId}`);
    this.logger.log(`Revoked token for stream ${streamId} session ${sessionId}`);
  }

  async isTokenValid(streamId: string, sessionId: string): Promise<boolean> {
    return this.redisService.exists(`wowza_token:${streamId}:${sessionId}`);
  }
}
