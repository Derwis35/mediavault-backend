import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { Evidence } from './entities/evidence.entity';

export interface CustodyRecord {
  evidenceId: string;
  type: string;
  recordedAt?: string;
  capturedBy: { id: string; name: string; role?: string };
  stream: { id: string; name: string; wowzaAppName: string } | null;
  event: { id: string; title: string } | null;
  fileInfo: { path: string; sizeBytes: string };
  integrity: { sha256: string; algorithm: string };
  platform: string;
  platformVersion: string;
  generatedAt: string;
}

@Injectable()
export class EvidencesIntegrityService {
  async computeHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data: Buffer | string) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  computeHashFromBuffer(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  async verifyIntegrity(
    absoluteFilePath: string,
    expectedHash: string,
  ): Promise<{ isValid: boolean; computedHash: string; expectedHash: string; verifiedAt: string }> {
    const computedHash = await this.computeHash(absoluteFilePath);
    const computedBuf = Buffer.from(computedHash, 'hex');
    const expectedBuf = Buffer.from(expectedHash, 'hex');

    let isValid = false;
    if (computedBuf.length === expectedBuf.length) {
      isValid = crypto.timingSafeEqual(computedBuf, expectedBuf);
    }

    return { isValid, computedHash, expectedHash, verifiedAt: new Date().toISOString() };
  }

  generateCustodyRecord(
    evidence: Evidence & { uploadedBy?: { id: string; firstName: string; lastName: string; role?: { name: string } } },
    _user?: unknown,
  ): CustodyRecord {
    const uploader = evidence.uploadedBy;
    return {
      evidenceId: evidence.id,
      type: evidence.type,
      recordedAt: evidence.recordedAt?.toISOString(),
      capturedBy: {
        id: uploader?.id ?? '',
        name: uploader ? `${uploader.firstName} ${uploader.lastName}`.trim() : '',
        role: uploader?.role?.name,
      },
      stream: evidence.stream
        ? {
            id: evidence.stream.id,
            name: evidence.stream.name,
            wowzaAppName: evidence.stream.wowzaAppName,
          }
        : null,
      event: evidence.event
        ? { id: evidence.event.id, title: evidence.event.title }
        : null,
      fileInfo: {
        path: evidence.storagePath,
        sizeBytes: evidence.fileSizeBytes,
      },
      integrity: {
        sha256: evidence.hashSha256,
        algorithm: 'SHA-256',
      },
      platform: 'MediaVault',
      platformVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
    };
  }
}
