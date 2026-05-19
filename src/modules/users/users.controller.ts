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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserFiltersDto } from './dto/user-filters.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthUser {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── Static /me routes (must come before /:id) ──────────────────────────

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.findOne(user.userId);
  }

  @Patch('me')
  updateMe(@Body() dto: UpdateProfileDto, @CurrentUser() user: AuthUser) {
    return this.usersService.updateProfile(user.userId, dto);
  }

  @Post('me/change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeOwnPassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: AuthUser) {
    await this.usersService.changeOwnPassword(user.userId, dto, user.sessionId);
  }

  // ─── Static /roles route (must come before /:id) ────────────────────────

  @Get('roles')
  @Roles('admin', 'supervisor')
  getRoles() {
    return this.usersService.getRoles();
  }

  // ─── Collection routes ───────────────────────────────────────────────────

  @Get()
  @Roles('admin', 'supervisor')
  findAll(@Query() filters: UserFiltersDto) {
    return this.usersService.findAll(filters);
  }

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.usersService.create(dto, user.userId);
  }

  // ─── Parametric /:id routes ──────────────────────────────────────────────

  @Get(':id')
  @Roles('admin', 'supervisor')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles('admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.update(id, dto, user.userId);
  }

  @Post(':id/activate')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.usersService.activate(id, user.userId);
  }

  @Post(':id/deactivate')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.usersService.deactivate(id, user.userId);
  }

  @Post(':id/change-password')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePasswordByAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.usersService.changePasswordByAdmin(id, dto, user.userId);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.usersService.remove(id, user.userId);
  }

  @Get(':id/sessions')
  @Roles('admin')
  getUserSessions(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getUserSessions(id);
  }

  @Get(':id/audit-history')
  getUserAuditHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.getUserAuditHistory(id, user.userId, user.role);
  }
}
