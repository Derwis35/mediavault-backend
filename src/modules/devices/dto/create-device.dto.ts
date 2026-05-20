import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { DeviceStatus } from '../entities/device.entity';

export class CreateDeviceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  serial!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  type?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  wowzaStreamName!: string;

  @IsUUID()
  @IsOptional()
  assignedUserId?: string;

  @IsEnum(DeviceStatus)
  @IsOptional()
  status?: DeviceStatus;
}
