import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { EvidenceType } from '../entities/evidence.entity';

export class EvidenceFiltersDto {
  @IsEnum(EvidenceType)
  @IsOptional()
  type?: EvidenceType;

  @IsUUID()
  @IsOptional()
  streamId?: string;

  @IsUUID()
  @IsOptional()
  eventId?: string;

  @IsUUID()
  @IsOptional()
  uploadedBy?: string;

  @IsISO8601()
  @IsOptional()
  fromDate?: string;

  @IsISO8601()
  @IsOptional()
  toDate?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  integrityVerified?: boolean;

  @IsString()
  @IsOptional()
  search?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
