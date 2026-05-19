import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { WowzaSecureTokenService } from './wowza-secure-token.service';
import { WowzaService } from './wowza.service';

interface JwtUser {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
}

@Controller('wowza')
export class WowzaController {
  constructor(
    private readonly wowzaService: WowzaService,
    private readonly wowzaSecureTokenService: WowzaSecureTokenService,
    private readonly auditService: AuditService,
  ) {}

  @Get('status')
  getStatus() {
    return this.wowzaService.getServerStatus();
  }

  @Get('applications')
  @Roles('admin', 'supervisor')
  getApplications() {
    return this.wowzaService.getApplications();
  }

  @Get('applications/:appName')
  @Roles('admin', 'supervisor')
  getApplication(@Param('appName') appName: string) {
    return this.wowzaService.getApplication(appName);
  }

  @Get('applications/:appName/streams')
  @Roles('admin', 'supervisor', 'operator')
  getStreams(@Param('appName') appName: string) {
    return this.wowzaService.getIncomingStreams(appName);
  }

  @Get('applications/:appName/streams/:streamName')
  @Roles('admin', 'supervisor', 'operator')
  getStream(
    @Param('appName') appName: string,
    @Param('streamName') streamName: string,
  ) {
    return this.wowzaService.getIncomingStream(appName, streamName);
  }

  @Post('applications/:appName/streams/:streamName/connect')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.NO_CONTENT)
  async connectStream(
    @Param('appName') appName: string,
    @Param('streamName') streamName: string,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    await this.wowzaService.connectStream(appName, streamName);
    await this.auditService.logAction(
      'WOWZA_STREAM_CONNECT',
      'stream',
      streamName,
      user.userId,
      req.ip,
      { appName },
    );
  }

  @Post('applications/:appName/streams/:streamName/disconnect')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnectStream(
    @Param('appName') appName: string,
    @Param('streamName') streamName: string,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    await this.wowzaService.disconnectStream(appName, streamName);
    await this.auditService.logAction(
      'WOWZA_STREAM_DISCONNECT',
      'stream',
      streamName,
      user.userId,
      req.ip,
      { appName },
    );
  }

  @Get('connections')
  @Roles('admin', 'supervisor')
  getConnections() {
    return this.wowzaService.getConnections();
  }

  @Get('streams/:streamId/playback-url')
  @Roles('admin', 'supervisor', 'operator', 'viewer')
  getPlaybackUrl(
    @Param('streamId') streamId: string,
    @Query('appName') appName: string,
    @Query('streamName') streamName: string,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    return this.wowzaSecureTokenService.generateSecureToken(
      { streamName, appName, clientIp: req.ip, ttlSeconds: 1800 },
      user.sessionId,
      streamId,
    );
  }

  @Delete('streams/:streamId/token')
  @Roles('admin', 'supervisor', 'operator')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeToken(
    @Param('streamId') streamId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.wowzaSecureTokenService.revokeToken(streamId, user.sessionId);
  }
}
