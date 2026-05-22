import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsOptional()
  firstName?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsOptional()
  lastName?: string;

  @IsEnum(['admin', 'supervisor', 'operator', 'viewer'])
  @IsOptional()
  role?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsIn(['cedula', 'placa', 'codigo_unico'])
  @IsOptional()
  idType?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  idNumber?: string;

  @IsString()
  @MaxLength(150)
  @IsOptional()
  cargo?: string;

  @IsUUID()
  @IsOptional()
  zoneId?: string;

  @IsUUID()
  @IsOptional()
  quadrantId?: string;
}
