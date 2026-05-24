import { IsHexColor, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateClasificacionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDays?: number;

  @IsHexColor()
  @IsNotEmpty()
  color!: string;
}
