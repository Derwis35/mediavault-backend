import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { SecurityService } from './security.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthUser {
  userId: string;
  role: string;
}

@Controller('security')
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Get('sessions')
  @Roles('admin', 'supervisor')
  getSessions(
    @Query('userId') userId?: string,
    @Query('role') role?: string,
    @Query('fromDate') fromDate?: string,
  ) {
    return this.securityService.getActiveSessions({ userId, role, fromDate });
  }

  @Get('sessions/:sessionId')
  @Roles('admin')
  getSessionDetail(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.securityService.getSessionDetail(sessionId);
  }

  @Delete('sessions/:sessionId')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.securityService.revokeSession(sessionId, user.userId);
  }

  @Delete('users/:userId/sessions')
  @Roles('admin')
  async revokeAllUserSessions(
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const revoked = await this.securityService.revokeAllUserSessions(targetUserId, user.userId);
    return { revoked };
  }

  @Get('anomalies')
  @Roles('admin', 'supervisor')
  detectAnomalies() {
    return this.securityService.detectAnomalies();
  }

  @Get('report')
  @Roles('admin')
  getReport() {
    return this.securityService.getSecurityReport();
  }
}
