import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateMunicipalityDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsUUID()
  stateId!: string;
}
