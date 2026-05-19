import { IsEnum, IsISO8601, IsObject, IsOptional, IsUUID } from 'class-validator';
import { EvidenceType } from '../entities/evidence.entity';

export class CreateEvidenceDto {
  @IsUUID()
  @IsOptional()
  streamId?: string;

  @IsUUID()
  @IsOptional()
  eventId?: string;

  @IsEnum(EvidenceType)
  type!: EvidenceType;

  @IsISO8601()
  recordedAt!: string;

  @IsObject()
  @IsOptional()
  metadata?: {
    cameraName?: string;
    location?: string;
    operator?: string;
    notes?: string;
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    [key: string]: unknown;
  };
}
