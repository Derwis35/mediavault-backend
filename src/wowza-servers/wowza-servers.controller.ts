import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { WowzaServersService } from './wowza-servers.service';
import { CreateWowzaServerDto } from './dto/create-wowza-server.dto';
import { UpdateWowzaServerDto } from './dto/update-wowza-server.dto';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { Roles } from '../modules/auth/decorators/roles.decorator';

@Controller('wowza-servers')
@UseGuards(JwtAuthGuard)
@Roles('admin', 'supervisor')
export class WowzaServersController {
  constructor(private readonly service: WowzaServersService) {}

  /** GET /wowza-servers — lista todos (sin apiPassword) */
  @Get()
  findAll() {
    return this.service.findAll();
  }

  /** GET /wowza-servers/:id — detalle (sin apiPassword) */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  /** POST /wowza-servers — crear nuevo servidor */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateWowzaServerDto) {
    return this.service.create(dto);
  }

  /** PUT /wowza-servers/:id — editar (apiPassword vacío = no actualizar) */
  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWowzaServerDto) {
    return this.service.update(id, dto);
  }

  /** DELETE /wowza-servers/:id — eliminar (error si isDefault=true) */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  /** POST /wowza-servers/:id/set-default — marcar como default en transacción */
  @Post(':id/set-default')
  @HttpCode(HttpStatus.OK)
  setDefault(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.setDefault(id);
  }

  /** POST /wowza-servers/:id/test — probar conexión real contra Wowza REST API */
  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  testConnection(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.testConnection(id);
  }
}
