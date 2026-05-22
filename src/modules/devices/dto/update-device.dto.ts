import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
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

  @IsUUID()
  @IsOptional()
  assignedUserId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsUUID()
  @IsOptional()
  quadrantId?: string;

  @IsUUID()
  @IsOptional()
  zoneId?: string;
}
