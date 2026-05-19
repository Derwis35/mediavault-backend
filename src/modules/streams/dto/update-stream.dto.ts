import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { StreamProtocol } from '../entities/stream.entity';
import {
  AudioCodecStrategy,
  StreamTransportProtocol,
  VideoCodecStrategy,
} from '../../ingestion/types/ingestion-config.types';

// wowzaStreamName is intentionally omitted — it cannot change once the stream is created
export class UpdateStreamDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  wowzaAppName?: string;

  @IsOptional()
  @IsUrl({ protocols: ['rtsp', 'rtmp', 'srt', 'http', 'https'], require_tld: false })
  sourceUrl?: string;

  @IsOptional()
  @IsEnum(StreamProtocol)
  protocol?: StreamProtocol;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(StreamTransportProtocol)
  rtspTransport?: StreamTransportProtocol;

  @IsOptional()
  @IsEnum(VideoCodecStrategy)
  videoCodec?: VideoCodecStrategy;

  @IsOptional()
  @IsEnum(AudioCodecStrategy)
  audioCodec?: AudioCodecStrategy;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ffmpegExtraArgs?: string[];
}
