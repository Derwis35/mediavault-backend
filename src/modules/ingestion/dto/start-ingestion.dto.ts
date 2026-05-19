import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  AudioCodecStrategy,
  StreamTransportProtocol,
  VideoCodecStrategy,
} from '../types/ingestion-config.types';

export class StartIngestionDto {
  @IsUUID()
  streamId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: 'streamName solo puede contener letras, números, _ y -' })
  streamName!: string;

  @Matches(/^rtsp:\/\/.+/, { message: 'Debe ser una URL RTSP válida (rtsp://...)' })
  rtspUrl!: string;

  @IsString()
  wowzaAppName: string = 'live';

  @IsEnum(StreamTransportProtocol)
  transport: StreamTransportProtocol = StreamTransportProtocol.TCP;

  @IsEnum(VideoCodecStrategy)
  videoCodec: VideoCodecStrategy = VideoCodecStrategy.COPY;

  @IsEnum(AudioCodecStrategy)
  audioCodec: AudioCodecStrategy = AudioCodecStrategy.AAC;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(30000)
  reconnectDelayMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  maxReconnectAttempts?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ffmpegExtraArgs?: string[];
}
