import { StreamProtocol, StreamStatus } from '../entities/stream.entity';
import { WowzaPlaybackUrls } from '../../wowza/types/wowza-stream.types';

export class StreamResponseDto {
  id!: string;
  name!: string;
  description?: string;
  wowzaAppName!: string;
  wowzaStreamName!: string;
  sourceUrl?: string;
  protocol!: StreamProtocol;
  status!: StreamStatus;
  location?: string;
  metadata?: Record<string, unknown>;
  createdAt!: Date;
  updatedAt!: Date;
  isLiveInWowza!: boolean;
  ingestionStatus?: string;
  playbackUrls?: WowzaPlaybackUrls;
  activeConnections?: number;
}
