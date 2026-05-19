import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import { EvidencesIntegrityService } from './evidences-integrity.service';

describe('EvidencesIntegrityService', () => {
  let service: EvidencesIntegrityService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [EvidencesIntegrityService],
    }).compile();

    service = module.get<EvidencesIntegrityService>(EvidencesIntegrityService);
  });

  // ─── computeHashFromBuffer() ───────────────────────────────────────────────

  it('computeHashFromBuffer() retorna un SHA-256 hex de exactamente 64 caracteres', () => {
    const buffer = Buffer.from('test content');
    const hash = service.computeHashFromBuffer(buffer);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('computeHashFromBuffer() es determinista — mismo buffer produce mismo hash', () => {
    const buffer = Buffer.from('datos de evidencia forense');
    const hash1 = service.computeHashFromBuffer(buffer);
    const hash2 = service.computeHashFromBuffer(buffer);

    expect(hash1).toBe(hash2);
  });

  // ─── verifyIntegrity() ────────────────────────────────────────────────────

  it('verifyIntegrity() retorna isValid: true cuando el hash del archivo coincide', async () => {
    const content = Buffer.from('contenido de prueba');
    const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

    jest.spyOn(service, 'computeHash').mockResolvedValue(expectedHash);

    const result = await service.verifyIntegrity('/fake/path/file.mp4', expectedHash);

    expect(result.isValid).toBe(true);
    expect(result.computedHash).toBe(expectedHash);
    expect(result.expectedHash).toBe(expectedHash);
    expect(result.verifiedAt).toBeTruthy();
  });

  it('verifyIntegrity() retorna isValid: false cuando el hash ha sido alterado', async () => {
    const correctHash = 'a'.repeat(64);
    const tamperedHash = 'b'.repeat(64);

    jest.spyOn(service, 'computeHash').mockResolvedValue(tamperedHash);

    const result = await service.verifyIntegrity('/fake/path/file.mp4', correctHash);

    expect(result.isValid).toBe(false);
    expect(result.computedHash).toBe(tamperedHash);
    expect(result.expectedHash).toBe(correctHash);
  });
});
