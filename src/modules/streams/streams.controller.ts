import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { StreamsService } from './streams.service';
import { CreateStreamDto } from './dto/create-stream.dto';
import { UpdateStreamDto } from './dto/update-stream.dto';
import { StreamProtocol, StreamStatus } from './entities/stream.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

interface AuthUser {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
}

@Controller('streams')
export class StreamsController {
  constructor(private readonly streamsService: StreamsService) {}

  @Get()
  @Roles('admin', 'supervisor', 'operator', 'viewer')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: StreamStatus,
    @Query('protocol') protocol?: StreamProtocol,
    @Query('location') location?: string,
    @Query('search') search?: string,
    @Query('wowzaAppName') wowzaAppName?: string,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.streamsService.findAll(
      { status, protocol, location, search, wowzaAppName, deviceId },
      {
        page: page !== undefined ? Number(page) : undefined,
        limit: limit !== undefined ? Number(limit) : undefined,
      },
    );
  }

  @Post()
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateStreamDto, @CurrentUser() user: AuthUser) {
    return this.streamsService.create(dto, user.userId);
  }

  @Get(':id')
  @Roles('admin', 'supervisor', 'operator', 'viewer')
  @Audit('STREAM_VIEWED', 'Stream')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.streamsService.findOne(id);
  }

  @Patch(':id')
  @Roles('admin', 'supervisor')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStreamDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.streamsService.update(id, dto, user.userId);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.streamsService.remove(id, user.userId);
  }

  @Post(':id/start-ingestion')
  @Roles('admin', 'supervisor')
  startIngestion(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.streamsService.startIngestion(id, user.userId);
  }

  @Post(':id/stop-ingestion')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.NO_CONTENT)
  stopIngestion(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.streamsService.stopIngestion(id, user.userId);
  }

  @Get(':id/playback-url')
  @Roles('admin', 'supervisor', 'operator', 'viewer')
  getPlaybackUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof forwarded === 'string' ? forwarded : forwarded?.[0])?.split(',')[0]?.trim() ??
      req.ip ??
      '';
    return this.streamsService.getPlaybackUrl(id, user.sessionId, clientIp);
  }

  @Post(':id/sync-status')
  @Roles('admin', 'supervisor')
  syncStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.streamsService.syncStatusFromWowza(id);
  }

  @Get(':id/ingestion-status')
  @Roles('admin', 'supervisor', 'operator')
  async getIngestionStatus(@Param('id', ParseUUIDPipe) id: string) {
    const state = await this.streamsService.getIngestionStatus(id);
    if (!state) {
      throw new NotFoundException('No hay proceso de ingesta activo para este stream');
    }
    return state;
  }
}
