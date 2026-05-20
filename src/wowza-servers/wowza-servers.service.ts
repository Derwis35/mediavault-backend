import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { WowzaServer } from './entities/wowza-server.entity';
import { CreateWowzaServerDto } from './dto/create-wowza-server.dto';
import { UpdateWowzaServerDto } from './dto/update-wowza-server.dto';
import { WowzaServerResponseDto } from './dto/wowza-server-response.dto';

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
}

@Injectable()
export class WowzaServersService {
  private readonly logger = new Logger(WowzaServersService.name);

  constructor(
    @InjectRepository(WowzaServer)
    private readonly repo: Repository<WowzaServer>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<WowzaServerResponseDto[]> {
    const servers = await this.repo.find({ order: { isDefault: 'DESC', name: 'ASC' } });
    return servers.map(WowzaServerResponseDto.fromEntity);
  }

  async findOne(id: string): Promise<WowzaServerResponseDto> {
    const server = await this.findEntityById(id);
    return WowzaServerResponseDto.fromEntity(server);
  }

  async findDefault(): Promise<WowzaServerResponseDto | null> {
    const server = await this.repo.findOne({ where: { isDefault: true, isActive: true } });
    return server ? WowzaServerResponseDto.fromEntity(server) : null;
  }

  async create(dto: CreateWowzaServerDto): Promise<WowzaServerResponseDto> {
    const existing = await this.repo.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`Ya existe un servidor Wowza con el nombre '${dto.name}'`);
    }

    if (dto.isDefault) {
      await this.repo.update({ isDefault: true }, { isDefault: false });
    }

    const server = this.repo.create({
      ...dto,
      portStream: dto.portStream ?? 1935,
      portHls: dto.portHls ?? 8088,
      portApi: dto.portApi ?? 8087,
      isDefault: dto.isDefault ?? false,
      isActive: dto.isActive ?? true,
    });

    const saved = await this.repo.save(server);
    this.logger.log(`Servidor Wowza creado: ${saved.id} (${saved.name})`);
    return WowzaServerResponseDto.fromEntity(saved);
  }

  async update(id: string, dto: UpdateWowzaServerDto): Promise<WowzaServerResponseDto> {
    const server = await this.findEntityById(id);

    if (dto.name && dto.name !== server.name) {
      const conflict = await this.repo.findOne({ where: { name: dto.name } });
      if (conflict) {
        throw new ConflictException(`Ya existe un servidor Wowza con el nombre '${dto.name}'`);
      }
    }

    if (dto.isDefault === true) {
      await this.repo.update({ isDefault: true }, { isDefault: false });
    }

    const { apiPassword, ...rest } = dto;
    Object.assign(server, rest);

    // Solo actualiza la contraseña si viene con valor no vacío
    if (apiPassword !== undefined && apiPassword !== '') {
      server.apiPassword = apiPassword;
    }

    const saved = await this.repo.save(server);
    this.logger.log(`Servidor Wowza actualizado: ${saved.id}`);
    return WowzaServerResponseDto.fromEntity(saved);
  }

  async setDefault(id: string): Promise<WowzaServerResponseDto> {
    await this.findEntityById(id);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      await qr.manager.update(WowzaServer, { isDefault: true }, { isDefault: false });
      await qr.manager.update(WowzaServer, { id }, { isDefault: true });
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    this.logger.log(`Servidor Wowza ${id} marcado como default`);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const server = await this.findEntityById(id);

    if (server.isDefault) {
      throw new BadRequestException(
        'No se puede eliminar el servidor por defecto. Asigna otro como default primero.',
      );
    }

    await this.repo.remove(server);
    this.logger.log(`Servidor Wowza eliminado: ${id}`);
  }

  async testConnection(id: string): Promise<TestConnectionResult> {
    const server = await this.findEntityById(id);
    const url = `http://${server.ip}:${server.portApi}/v2/servers/_defaultServer_`;
    const credentials = Buffer.from(`${server.apiUser}:${server.apiPassword}`).toString('base64');

    let ok = false;
    let latencyMs = 0;
    let version: string | undefined;
    let error: string | undefined;

    const start = Date.now();
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${credentials}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      latencyMs = Date.now() - start;

      if (res.ok) {
        ok = true;
        const body = (await res.json()) as Record<string, unknown>;
        version = (body?.serverVersion as string | undefined) ?? undefined;
      } else {
        error = `HTTP ${res.status} ${res.statusText}`;
      }
    } catch (err: unknown) {
      latencyMs = Date.now() - start;
      error = err instanceof Error ? err.message : 'Error de conexión';
    }

    await this.repo.update(id, { lastTestedAt: new Date(), lastTestOk: ok });
    this.logger.log(
      `Test ${server.name}: ${ok ? 'OK' : 'FAIL'} — ${latencyMs}ms${error ? ` — ${error}` : ''}`,
    );

    return { ok, latencyMs, version, error };
  }

  private async findEntityById(id: string): Promise<WowzaServer> {
    const server = await this.repo.findOne({ where: { id } });
    if (!server) throw new NotFoundException(`Servidor Wowza ${id} no encontrado`);
    return server;
  }
}
