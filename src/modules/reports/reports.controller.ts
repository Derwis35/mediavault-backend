import {
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ExpiringSoonQueryDto,
  ReportActiveQueryDto,
  ReportDeletedQueryDto,
  ReportRangeQueryDto,
} from './dto/report-query.dto';

@Controller('reports')
@Roles('admin', 'supervisor')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  getSummary(@Query() query: ReportRangeQueryDto) {
    const from = query.from ? new Date(query.from) : new Date(0);
    const to = query.to ? new Date(query.to) : new Date();
    return this.reportsService.getSummary(from, to);
  }

  @Get('deleted')
  getDeleted(@Query() query: ReportDeletedQueryDto) {
    const from = query.from ? new Date(query.from) : new Date(0);
    const to = query.to ? new Date(query.to) : new Date();
    return this.reportsService.getDeleted(
      from,
      to,
      query.clasificacionId,
      query.page ?? 1,
      query.limit ?? 25,
    );
  }

  @Get('active')
  getActive(@Query() query: ReportActiveQueryDto) {
    const from = query.from ? new Date(query.from) : new Date(0);
    const to = query.to ? new Date(query.to) : new Date();
    return this.reportsService.getActive(
      from,
      to,
      query.clasificacionId,
      query.etiquetaId,
      query.fileType,
      query.page ?? 1,
      query.limit ?? 25,
    );
  }

  @Get('expiring-soon')
  getExpiringSoon(@Query() query: ExpiringSoonQueryDto) {
    return this.reportsService.getExpiringSoon(query.days ?? 7);
  }

  @Get('export')
  async exportCsv(
    @Query() query: ReportRangeQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const from = query.from ? new Date(query.from) : new Date(0);
    const to = query.to ? new Date(query.to) : new Date();
    const csv = await this.reportsService.exportCsv(from, to);
    const date = new Date().toISOString().slice(0, 10);

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reporte-retention-${date}.csv"`,
    });
    res.send(csv);
  }
}
