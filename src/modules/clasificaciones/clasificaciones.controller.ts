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
} from '@nestjs/common';
import { ClasificacionesService } from './clasificaciones.service';
import { CreateClasificacionDto } from './dto/create-clasificacion.dto';
import { UpdateClasificacionDto } from './dto/update-clasificacion.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('clasificaciones')
export class ClasificacionesController {
  constructor(private readonly clasificacionesService: ClasificacionesService) {}

  @Get()
  @Roles('admin', 'supervisor', 'operator', 'viewer')
  findAll() {
    return this.clasificacionesService.findAll();
  }

  @Get(':id')
  @Roles('admin', 'supervisor', 'operator', 'viewer')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clasificacionesService.findOne(id);
  }

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateClasificacionDto) {
    return this.clasificacionesService.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClasificacionDto) {
    return this.clasificacionesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.clasificacionesService.remove(id);
  }
}
