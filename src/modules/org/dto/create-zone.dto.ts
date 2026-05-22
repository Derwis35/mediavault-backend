import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateZoneDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsUUID()
  municipalityId!: string;
}
