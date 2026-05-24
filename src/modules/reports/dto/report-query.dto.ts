import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ReportRangeQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ReportDeletedQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @IsUUID()
  clasificacionId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

export class ReportActiveQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @IsUUID()
  clasificacionId?: string;

  @IsOptional()
  @IsUUID()
  etiquetaId?: string;

  @IsOptional()
  @IsString()
  fileType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

export class ExpiringSoonQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  days?: number;
}
