import {
  IsBoolean,
  IsIP,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
// MinLength se conserva para los otros campos de texto
import { Type } from 'class-transformer';

export class UpdateWowzaServerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIP()
  ip?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  portStream?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  portHls?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  portApi?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  apiUser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  apiPassword?: string; // cadena vacía = no actualizar

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(255)
  go2rtcUrl?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
