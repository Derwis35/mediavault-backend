import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateStateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsUUID()
  countryId!: string;
}
