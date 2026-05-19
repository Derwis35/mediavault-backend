import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuditService } from './audit.service';
import { AuditFiltersDto } from './dto/audit-filters.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles('admin', 'supervisor')
  findAll(@Query() filters: AuditFiltersDto) {
    return this.auditService.findAll(filters);
  }

  @Get('summary')
  @Roles('admin', 'supervisor')
  getSummary(@Query('fromDate') fromDate?: string, @Query('toDate') toDate?: string) {
    return this.auditService.getActionSummary(fromDate, toDate);
  }

  @Get('export')
  @Roles('admin')
  async exportCsv(@Query() filters: AuditFiltersDto, @Res() res: Response): Promise<void> {
    const csv = await this.auditService.exportToCsv(filters);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="audit-${timestamp}.csv"`,
    });

    res.send(csv);
  }

  @Get('entity/:entityType/:entityId')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.OK)
  findByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ) {
    return this.auditService.findByEntity(entityType, entityId);
  }

  @Get('user/:userId')
  @Roles('admin')
  findByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.findByUser(userId, limit ? Number(limit) : undefined);
  }
}
