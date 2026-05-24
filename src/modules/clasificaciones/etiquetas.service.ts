import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Etiqueta } from './entities/etiqueta.entity';
import { Clasificacion } from './entities/clasificacion.entity';
import { CreateEtiquetaDto } from './dto/create-etiqueta.dto';
import { UpdateEtiquetaDto } from './dto/update-etiqueta.dto';

@Injectable()
export class EtiquetasService {
  constructor(
    @InjectRepository(Etiqueta)
    private readonly etiquetaRepo: Repository<Etiqueta>,
    @InjectRepository(Clasificacion)
    private readonly clasificacionRepo: Repository<Clasificacion>,
  ) {}

  async findAll(clasificacionId?: string): Promise<Etiqueta[]> {
    const where: FindOptionsWhere<Etiqueta> = {};
    if (clasificacionId) {
      where.clasificacion = { id: clasificacionId };
    }
    return this.etiquetaRepo.find({
      where,
      relations: ['clasificacion'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Etiqueta> {
    const item = await this.etiquetaRepo.findOne({
      where: { id },
      relations: ['clasificacion'],
    });
    if (!item) throw new NotFoundException(`Etiqueta ${id} no encontrada`);
    return item;
  }

  async create(dto: CreateEtiquetaDto): Promise<Etiqueta> {
    const clasificacion = await this.clasificacionRepo.findOne({
      where: { id: dto.clasificacionId },
    });
    if (!clasificacion) {
      throw new NotFoundException(`Clasificación ${dto.clasificacionId} no encontrada`);
    }
    const item = this.etiquetaRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      clasificacion,
    });
    return this.etiquetaRepo.save(item);
  }

  async update(id: string, dto: UpdateEtiquetaDto): Promise<Etiqueta> {
    const item = await this.etiquetaRepo.findOne({
      where: { id },
      relations: ['clasificacion'],
    });
    if (!item) throw new NotFoundException(`Etiqueta ${id} no encontrada`);
    if (item.isSystem) {
      throw new ForbiddenException('No se puede modificar una etiqueta del sistema');
    }

    if (dto.name !== undefined) item.name = dto.name;
    if (dto.description !== undefined) item.description = dto.description ?? null;

    if (dto.clasificacionId !== undefined) {
      const clasificacion = await this.clasificacionRepo.findOne({
        where: { id: dto.clasificacionId },
      });
      if (!clasificacion) {
        throw new NotFoundException(`Clasificación ${dto.clasificacionId} no encontrada`);
      }
      item.clasificacion = clasificacion;
    }

    return this.etiquetaRepo.save(item);
  }

  async remove(id: string): Promise<void> {
    const item = await this.etiquetaRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Etiqueta ${id} no encontrada`);
    await this.etiquetaRepo.delete(id);
  }
}
