import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { OrgLevel, OrgService } from './org.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateCountryDto } from './dto/create-country.dto';
import { CreateStateDto } from './dto/create-state.dto';
import { CreateMunicipalityDto } from './dto/create-municipality.dto';
import { CreateZoneDto } from './dto/create-zone.dto';
import { CreateQuadrantDto } from './dto/create-quadrant.dto';

const VALID_LEVELS: OrgLevel[] = ['country', 'state', 'municipality', 'zone', 'quadrant'];

@Controller('org')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get('countries')
  getCountries() {
    return this.orgService.getCountries();
  }

  @Post('countries')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.CREATED)
  createCountry(@Body() dto: CreateCountryDto) {
    return this.orgService.createCountry(dto.name);
  }

  @Get('states')
  getStates(@Query('countryId') countryId: string) {
    return this.orgService.getStates(countryId);
  }

  @Post('states')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.CREATED)
  createState(@Body() dto: CreateStateDto) {
    return this.orgService.createState(dto.name, dto.countryId);
  }

  @Get('municipalities')
  getMunicipalities(@Query('stateId') stateId: string) {
    return this.orgService.getMunicipalities(stateId);
  }

  @Post('municipalities')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.CREATED)
  createMunicipality(@Body() dto: CreateMunicipalityDto) {
    return this.orgService.createMunicipality(dto.name, dto.stateId);
  }

  @Get('zones')
  getZones(@Query('municipalityId') municipalityId: string) {
    return this.orgService.getZones(municipalityId);
  }

  @Post('zones')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.CREATED)
  createZone(@Body() dto: CreateZoneDto) {
    return this.orgService.createZone(dto.name, dto.municipalityId);
  }

  @Get('quadrants')
  getQuadrants(@Query('zoneId') zoneId: string) {
    return this.orgService.getQuadrants(zoneId);
  }

  @Post('quadrants')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.CREATED)
  createQuadrant(@Body() dto: CreateQuadrantDto) {
    return this.orgService.createQuadrant(dto.name, dto.zoneId);
  }

  @Get('zone-hierarchy/:zoneId')
  getZoneHierarchy(@Param('zoneId') zoneId: string) {
    return this.orgService.getZoneHierarchy(zoneId);
  }

  @Delete(':level/:id')
  @Roles('admin', 'supervisor')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('level') level: string, @Param('id') id: string) {
    if (!VALID_LEVELS.includes(level as OrgLevel)) {
      throw new BadRequestException(`Nivel inválido: ${level}. Valores: ${VALID_LEVELS.join(', ')}`);
    }
    return this.orgService.delete(level as OrgLevel, id);
  }
}
