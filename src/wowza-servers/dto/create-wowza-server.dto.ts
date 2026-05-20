import {
  IsBoolean,
  IsIP,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPort,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWowzaServerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsIP()
  ip!: string;

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

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  appName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  apiUser!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(128)
  apiPassword!: string;

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
