import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Clasificacion } from './entities/clasificacion.entity';
import { Etiqueta } from './entities/etiqueta.entity';
import { CreateClasificacionDto } from './dto/create-clasificacion.dto';
import { UpdateClasificacionDto } from './dto/update-clasificacion.dto';

@Injectable()
export class ClasificacionesService {
  constructor(
    @InjectRepository(Clasificacion)
    private readonly clasificacionRepo: Repository<Clasificacion>,
    @InjectRepository(Etiqueta)
    private readonly etiquetaRepo: Repository<Etiqueta>,
  ) {}

  async findAll(): Promise<Clasificacion[]> {
    return this.clasificacionRepo
      .createQueryBuilder('c')
      .loadRelationCountAndMap('c.etiquetasCount', 'c.etiquetas', 'et', (qb) =>
        qb.andWhere('et.isActive = :isActive', { isActive: true }),
      )
      .orderBy('c.name', 'ASC')
      .getMany();
  }

  async findOne(id: string): Promise<Clasificacion> {
    const item = await this.clasificacionRepo.findOne({
      where: { id },
      relations: ['etiquetas'],
    });
    if (!item) throw new NotFoundException(`Clasificación ${id} no encontrada`);
    return item;
  }

  async create(dto: CreateClasificacionDto): Promise<Clasificacion> {
    const existing = await this.clasificacionRepo.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`Ya existe una clasificación con el nombre "${dto.name}"`);
    }
    const item = this.clasificacionRepo.create({
      name: dto.name,
      color: dto.color,
      retentionDays: dto.retentionDays ?? null,
    });
    return this.clasificacionRepo.save(item);
  }

  async update(id: string, dto: UpdateClasificacionDto): Promise<Clasificacion> {
    const item = await this.clasificacionRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Clasificación ${id} no encontrada`);
    if (item.isSystem) {
      throw new ForbiddenException('No se puede modificar una clasificación del sistema');
    }
    Object.assign(item, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.color !== undefined && { color: dto.color }),
      ...(dto.retentionDays !== undefined && { retentionDays: dto.retentionDays }),
    });
    return this.clasificacionRepo.save(item);
  }

  async remove(id: string): Promise<void> {
    const item = await this.clasificacionRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Clasificación ${id} no encontrada`);
    if (item.isSystem) {
      throw new ForbiddenException('No se puede eliminar una clasificación del sistema');
    }

    const [result] = await this.clasificacionRepo.query(
      `SELECT COUNT(*) FROM evidences ev
       JOIN etiquetas et ON et.id = ev.etiqueta_id
       WHERE et.clasificacion_id = $1 AND ev.deleted_at IS NULL`,
      [id],
    ) as Array<{ count: string }>;

    if (parseInt(result.count, 10) > 0) {
      throw new ForbiddenException(
        'La clasificación tiene etiquetas asignadas a evidencias y no puede ser eliminada',
      );
    }

    await this.clasificacionRepo.delete(id);
  }
}
