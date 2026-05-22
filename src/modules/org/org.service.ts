import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from './entities/country.entity';
import { State } from './entities/state.entity';
import { Municipality } from './entities/municipality.entity';
import { Zone } from './entities/zone.entity';
import { Quadrant } from './entities/quadrant.entity';

export type OrgLevel = 'country' | 'state' | 'municipality' | 'zone' | 'quadrant';

@Injectable()
export class OrgService {
  constructor(
    @InjectRepository(Country) private readonly countryRepo: Repository<Country>,
    @InjectRepository(State) private readonly stateRepo: Repository<State>,
    @InjectRepository(Municipality) private readonly municipalityRepo: Repository<Municipality>,
    @InjectRepository(Zone) private readonly zoneRepo: Repository<Zone>,
    @InjectRepository(Quadrant) private readonly quadrantRepo: Repository<Quadrant>,
  ) {}

  getCountries(): Promise<Country[]> {
    return this.countryRepo.find({ order: { name: 'ASC' } });
  }

  async createCountry(name: string): Promise<Country> {
    return this.countryRepo.save(this.countryRepo.create({ name }));
  }

  async getStates(countryId: string): Promise<State[]> {
    const exists = await this.countryRepo.existsBy({ id: countryId });
    if (!exists) throw new NotFoundException(`País ${countryId} no encontrado`);
    return this.stateRepo.find({ where: { countryId }, order: { name: 'ASC' } });
  }

  async createState(name: string, countryId: string): Promise<State> {
    const country = await this.countryRepo.findOneBy({ id: countryId });
    if (!country) throw new NotFoundException(`País ${countryId} no encontrado`);
    return this.stateRepo.save(this.stateRepo.create({ name, country, countryId }));
  }

  async getMunicipalities(stateId: string): Promise<Municipality[]> {
    const exists = await this.stateRepo.existsBy({ id: stateId });
    if (!exists) throw new NotFoundException(`Departamento ${stateId} no encontrado`);
    return this.municipalityRepo.find({ where: { stateId }, order: { name: 'ASC' } });
  }

  async createMunicipality(name: string, stateId: string): Promise<Municipality> {
    const state = await this.stateRepo.findOneBy({ id: stateId });
    if (!state) throw new NotFoundException(`Departamento ${stateId} no encontrado`);
    return this.municipalityRepo.save(this.municipalityRepo.create({ name, state, stateId }));
  }

  async getZones(municipalityId: string): Promise<Zone[]> {
    const exists = await this.municipalityRepo.existsBy({ id: municipalityId });
    if (!exists) throw new NotFoundException(`Municipio ${municipalityId} no encontrado`);
    return this.zoneRepo.find({ where: { municipalityId }, order: { name: 'ASC' } });
  }

  async createZone(name: string, municipalityId: string): Promise<Zone> {
    const municipality = await this.municipalityRepo.findOneBy({ id: municipalityId });
    if (!municipality) throw new NotFoundException(`Municipio ${municipalityId} no encontrado`);
    return this.zoneRepo.save(this.zoneRepo.create({ name, municipality, municipalityId }));
  }

  async getQuadrants(zoneId: string): Promise<Quadrant[]> {
    const exists = await this.zoneRepo.existsBy({ id: zoneId });
    if (!exists) throw new NotFoundException(`Zona ${zoneId} no encontrada`);
    return this.quadrantRepo.find({ where: { zoneId }, order: { name: 'ASC' } });
  }

  async createQuadrant(name: string, zoneId: string): Promise<Quadrant> {
    const zone = await this.zoneRepo.findOneBy({ id: zoneId });
    if (!zone) throw new NotFoundException(`Zona ${zoneId} no encontrada`);
    return this.quadrantRepo.save(this.quadrantRepo.create({ name, zone, zoneId }));
  }

  async getZoneHierarchy(zoneId: string): Promise<{
    zoneId: string;
    municipalityId: string;
    stateId: string;
    countryId: string;
  }> {
    const zone = await this.zoneRepo.findOneBy({ id: zoneId });
    if (!zone) throw new NotFoundException(`Zona ${zoneId} no encontrada`);

    const municipality = await this.municipalityRepo.findOneBy({ id: zone.municipalityId });
    if (!municipality) throw new NotFoundException(`Municipio no encontrado`);

    const state = await this.stateRepo.findOneBy({ id: municipality.stateId });
    if (!state) throw new NotFoundException(`Estado no encontrado`);

    return {
      zoneId: zone.id,
      municipalityId: municipality.id,
      stateId: state.id,
      countryId: state.countryId,
    };
  }

  async delete(level: OrgLevel, id: string): Promise<void> {
    const repoMap: Record<OrgLevel, Repository<Country | State | Municipality | Zone | Quadrant>> = {
      country: this.countryRepo,
      state: this.stateRepo,
      municipality: this.municipalityRepo,
      zone: this.zoneRepo,
      quadrant: this.quadrantRepo,
    };

    const repo = repoMap[level];
    const entity = await repo.findOneBy({ id } as any);
    if (!entity) throw new NotFoundException(`${level} ${id} no encontrado`);
    await repo.remove(entity as any);
  }
}
