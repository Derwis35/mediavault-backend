import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

class EventFiltersQuery {
  @IsUUID()
  @IsOptional()
  ruleId?: string;

  @IsUUID()
  @IsOptional()
  streamId?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  acknowledged?: boolean;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number;
}

class RuleFiltersQuery {
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  enabled?: boolean;

  @IsString()
  @IsOptional()
  severity?: string;
}

interface AuthUser {
  userId: string;
  role: string;
}

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  // ─── Rules ───────────────────────────────────────────────────────────────────

  @Get('rules')
  @Roles('admin', 'supervisor', 'operator')
  findAllRules(@Query() filters: RuleFiltersQuery) {
    return this.alertsService.findAllRules(filters);
  }

  @Post('rules')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.CREATED)
  createRule(@Body() dto: CreateAlertRuleDto, @CurrentUser() user: AuthUser) {
    return this.alertsService.createRule(dto, user.userId);
  }

  @Get('rules/:id')
  @Roles('admin', 'supervisor', 'operator')
  findOneRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertsService.findOneRule(id);
  }

  @Patch('rules/:id')
  @Roles('admin', 'supervisor')
  updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    return this.alertsService.updateRule(id, dto);
  }

  @Delete('rules/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRule(@Param('id', ParseUUIDPipe) id: string) {
    await this.alertsService.deleteRule(id);
  }

  // ─── Events ──────────────────────────────────────────────────────────────────

  @Get('events')
  @Roles('admin', 'supervisor', 'operator')
  findEvents(@Query() filters: EventFiltersQuery) {
    return this.alertsService.findEvents({
      ruleId: filters.ruleId,
      streamId: filters.streamId,
      acknowledged: filters.acknowledged,
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(filters.to) : undefined,
      limit: filters.limit,
    });
  }

  @Patch('events/:id/acknowledge')
  @Roles('admin', 'supervisor', 'operator')
  acknowledgeEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.alertsService.acknowledgeEvent(id, user.userId);
  }
}
