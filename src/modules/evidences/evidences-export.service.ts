import { BadRequestException, Injectable } from '@nestjs/common';
import * as archiver from 'archiver';
import * as fs from 'fs';
import * as path from 'path';
import { Evidence } from './entities/evidence.entity';
import { EvidencesStorageService } from './evidences-storage.service';
import { EvidencesIntegrityService } from './evidences-integrity.service';
import { AuditLog } from '../audit/entities/audit-log.entity';

@Injectable()
export class EvidencesExportService {
  constructor(
    private readonly storageService: EvidencesStorageService,
    private readonly integrityService: EvidencesIntegrityService,
  ) {}

  async exportEvidence(
    evidence: Evidence,
    auditEntries: AuditLog[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const archive = archiver.create('zip', { zlib: { level: 9 } });
      const chunks: Buffer[] = [];

      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      const absolutePath = this.storageService.getAbsolutePath(evidence.storagePath);
      const ext = path.extname(evidence.storagePath) || '.bin';
      const mediaFilename = `${evidence.id}${ext}`;
      const prefix = evidence.id;

      if (fs.existsSync(absolutePath)) {
        archive.file(absolutePath, { name: `${prefix}/media/${mediaFilename}` });
      }

      const metadata = {
        id: evidence.id,
        type: evidence.type,
        recordedAt: evidence.recordedAt?.toISOString(),
        createdAt: evidence.createdAt?.toISOString(),
        stream: evidence.stream
          ? { id: evidence.stream.id, name: evidence.stream.name }
          : null,
        event: evidence.event
          ? { id: evidence.event.id, title: evidence.event.title }
          : null,
        uploadedBy: evidence.uploadedBy
          ? {
              id: evidence.uploadedBy.id,
              name: `${evidence.uploadedBy.firstName ?? ''} ${evidence.uploadedBy.lastName ?? ''}`.trim(),
            }
          : null,
        metadata: evidence.metadata,
        fileSizeBytes: evidence.fileSizeBytes,
        durationSeconds: evidence.durationSeconds,
      };
      archive.append(JSON.stringify(metadata, null, 2), {
        name: `${prefix}/metadata.json`,
      });

      const custody = this.integrityService.generateCustodyRecord(evidence);
      archive.append(JSON.stringify(custody, null, 2), {
        name: `${prefix}/chain_of_custody.json`,
      });

      archive.append(JSON.stringify(auditEntries, null, 2), {
        name: `${prefix}/audit_trail.json`,
      });

      const integrityTxt = [
        `Algorithm: SHA-256`,
        `Hash: ${evidence.hashSha256}`,
        `File: media/${mediaFilename}`,
        `Verification command: sha256sum media/${mediaFilename}`,
        `Generated: ${new Date().toISOString()}`,
      ].join('\n');
      archive.append(integrityTxt, { name: `${prefix}/integrity.txt` });

      const readmeTxt = [
        `PAQUETE FORENSE MEDIAVAULT`,
        ``,
        `Este paquete contiene evidencia multimedia con cadena de custodia criptográfica.`,
        ``,
        `Para verificar la integridad del archivo:`,
        `  1. Abrir una terminal en el directorio del paquete extraído`,
        `  2. Ejecutar: sha256sum media/${mediaFilename}`,
        `  3. Comparar con el hash en integrity.txt`,
        ``,
        `En sistemas Windows, puede usar certutil:`,
        `  certutil -hashfile media/${mediaFilename} SHA256`,
        ``,
        `Generado: ${new Date().toISOString()}`,
        `Plataforma: MediaVault v1.0.0`,
      ].join('\n');
      archive.append(readmeTxt, { name: `${prefix}/README.txt` });

      archive.finalize();
    });
  }

  async exportMultipleEvidences(evidences: Evidence[], auditEntriesMap: Map<string, AuditLog[]>): Promise<Buffer> {
    if (evidences.length > 50) {
      throw new BadRequestException('No se pueden exportar más de 50 evidencias a la vez');
    }

    return new Promise((resolve, reject) => {
      const archive = archiver.create('zip', { zlib: { level: 6 } });
      const chunks: Buffer[] = [];

      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      for (const evidence of evidences) {
        const absolutePath = this.storageService.getAbsolutePath(evidence.storagePath);
        const ext = path.extname(evidence.storagePath) || '.bin';
        const mediaFilename = `${evidence.id}${ext}`;
        const prefix = evidence.id;

        if (fs.existsSync(absolutePath)) {
          archive.file(absolutePath, { name: `${prefix}/media/${mediaFilename}` });
        }

        const custody = this.integrityService.generateCustodyRecord(evidence);
        archive.append(JSON.stringify(custody, null, 2), {
          name: `${prefix}/chain_of_custody.json`,
        });

        const auditEntries = auditEntriesMap.get(evidence.id) ?? [];
        archive.append(JSON.stringify(auditEntries, null, 2), {
          name: `${prefix}/audit_trail.json`,
        });

        const integrityTxt = [
          `Algorithm: SHA-256`,
          `Hash: ${evidence.hashSha256}`,
          `File: media/${mediaFilename}`,
          `Verification command: sha256sum media/${mediaFilename}`,
          `Generated: ${new Date().toISOString()}`,
        ].join('\n');
        archive.append(integrityTxt, { name: `${prefix}/integrity.txt` });
      }

      archive.finalize();
    });
  }
}
