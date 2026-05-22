import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCountryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;
}
