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
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventFiltersDto } from './dto/event-filters.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthUser {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
}

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @Roles('admin', 'supervisor', 'operator', 'viewer')
  findAll(@Query() filters: EventFiltersDto) {
    return this.eventsService.findAll(filters);
  }

  @Post()
  @Roles('admin', 'supervisor', 'operator')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEventDto, @CurrentUser() user: AuthUser) {
    return this.eventsService.create(dto, user.userId);
  }

  @Get(':id')
  @Roles('admin', 'supervisor', 'operator', 'viewer')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  @Roles('admin', 'supervisor', 'operator')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.eventsService.update(id, dto, user.userId);
  }

  @Post(':id/close')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.OK)
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.eventsService.close(id, user.userId);
  }

  @Post(':id/streams/:streamId')
  @Roles('admin', 'supervisor', 'operator')
  @HttpCode(HttpStatus.OK)
  addStream(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('streamId', ParseUUIDPipe) streamId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.eventsService.addStream(id, streamId, user.userId);
  }

  @Delete(':id/streams/:streamId')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStream(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('streamId', ParseUUIDPipe) streamId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.eventsService.removeStream(id, streamId, user.userId);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.eventsService.remove(id, user.userId);
  }
}
