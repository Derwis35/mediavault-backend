import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateQuadrantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsUUID()
  zoneId!: string;
}
