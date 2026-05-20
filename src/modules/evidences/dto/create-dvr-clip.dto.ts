import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDvrClipDto {
  @IsUUID()
  streamId!: string;

  @IsISO8601()
  startTime!: string;

  @IsISO8601()
  endTime!: string;

  @IsString()
  @IsOptional()
  description?: string;
}
