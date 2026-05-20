import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DeviceStatus } from '../entities/device.entity';

export class UpdateDeviceDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  serial?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  type?: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(200)
  wowzaStreamName?: string;

  @IsEnum(DeviceStatus)
  @IsOptional()
  status?: DeviceStatus;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
