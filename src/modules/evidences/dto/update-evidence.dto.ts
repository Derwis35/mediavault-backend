import { IsObject, IsOptional } from 'class-validator';

export class UpdateEvidenceDto {
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
