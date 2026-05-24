import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
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

export { StreamProtocol };

export class CreateStreamDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  wowzaAppName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  wowzaStreamName!: string;

  @IsOptional()
  @IsUrl({ protocols: ['rtsp', 'rtmp', 'srt', 'http', 'https'], require_tld: false })
  sourceUrl?: string;

  @IsEnum(StreamProtocol)
  protocol!: StreamProtocol;

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

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  streamPath?: string;

  @IsOptional()
  @IsString()
  inputProtocol?: string;

  @IsOptional()
  @IsUUID()
  deviceId?: string;
}
