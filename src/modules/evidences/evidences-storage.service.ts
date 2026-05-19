import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as mime from 'mime-types';
import { EvidenceType } from './entities/evidence.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class EvidencesStorageService {
  private readonly logger = new Logger(EvidencesStorageService.name);
  private readonly storagePath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.storagePath = this.configService.get<string>('STORAGE_PATH') ?? './storage';
  }

  async saveFile(
    file: Express.Multer.File,
    evidenceId: string,
    type: EvidenceType,
  ): Promise<{ path: string; sizeBytes: number }> {
    const ext = mime.extension(file.mimetype) || 'bin';
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const relativePath = path.join(
      'evidences',
      String(year),
      month,
      day,
      type,
      `${evidenceId}.${ext}`,
    );
    const absolutePath = path.join(this.storagePath, relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer);

    return { path: relativePath, sizeBytes: file.buffer.length };
  }

  async deleteFile(storagePath: string): Promise<void> {
    const absolutePath = path.join(this.storagePath, storagePath);
    try {
      await fs.unlink(absolutePath);
    } catch {
      this.logger.warn(`Could not delete file at: ${absolutePath}`);
    }
  }

  getAbsolutePath(storagePath: string): string {
    return path.join(this.storagePath, storagePath);
  }

  async generateDownloadToken(evidenceId: string, userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const value = JSON.stringify({ evidenceId, userId });
    await this.redisService.set(`download:${token}`, value, 900);
    return token;
  }

  async resolveDownloadToken(
    token: string,
  ): Promise<{ evidenceId: string; userId: string } | null> {
    const value = await this.redisService.get(`download:${token}`);
    if (!value) return null;
    try {
      return JSON.parse(value) as { evidenceId: string; userId: string };
    } catch {
      return null;
    }
  }

  async invalidateDownloadToken(token: string): Promise<void> {
    await this.redisService.del(`download:${token}`);
  }
}
