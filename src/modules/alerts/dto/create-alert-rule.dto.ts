import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { AlertAction, AlertCondition, AlertSeverity } from '../entities/alert-rule.entity';

export class CreateAlertRuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  streamId?: string;

  @IsUUID()
  @IsOptional()
  deviceId?: string;

  @IsEnum(AlertCondition)
  condition!: AlertCondition;

  @IsObject()
  @IsOptional()
  params?: Record<string, unknown>;

  @IsEnum(AlertAction)
  action!: AlertAction;

  @IsString()
  @IsOptional()
  actionTarget?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsEnum(AlertSeverity)
  severity!: AlertSeverity;

  @IsNumber()
  @IsOptional()
  @Min(0)
  cooldownSeconds?: number;
}
