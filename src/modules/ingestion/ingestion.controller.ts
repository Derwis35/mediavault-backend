import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { StartIngestionDto } from './dto/start-ingestion.dto';
import { IngestionService } from './ingestion.service';

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('start')
  @Roles('admin', 'supervisor')
  startIngestion(@Body() dto: StartIngestionDto) {
    return this.ingestionService.startIngestion(dto);
  }

  @Post(':streamId/stop')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.NO_CONTENT)
  stopIngestion(@Param('streamId') streamId: string) {
    return this.ingestionService.stopIngestion(streamId);
  }

  @Get()
  @Roles('admin', 'supervisor', 'operator')
  getSummary() {
    return this.ingestionService.getSummary();
  }

  @Get(':streamId')
  @Roles('admin', 'supervisor', 'operator')
  getStatus(@Param('streamId') streamId: string) {
    return this.ingestionService.getStatus(streamId);
  }

  @Post(':streamId/restart')
  @Roles('admin', 'supervisor')
  restartIngestion(@Param('streamId') streamId: string) {
    return this.ingestionService.restartIngestion(streamId);
  }
}
