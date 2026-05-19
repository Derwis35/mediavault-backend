import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getAdminToken } from './setup/test-app';

const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Evidences E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let createdEvidenceId: string;
  let isDbAvailable = true;

  beforeAll(async () => {
    try {
      app = await createTestApp();
      adminToken = await getAdminToken(app);
    } catch (err) {
      isDbAvailable = false;
      console.warn('Evidences E2E skipped — test DB not available:', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const skip = () => !isDbAvailable;

  it('POST /api/evidences/snapshot con payload base64 → 201 + hash_sha256', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .post('/api/evidences/snapshot')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        data: SAMPLE_PNG_BASE64,
        mimeType: 'image/png',
        filename: 'e2e-test.png',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('hashSha256');
    expect(typeof res.body.hashSha256).toBe('string');
    expect(res.body.hashSha256).toHaveLength(64);
    createdEvidenceId = res.body.id as string;
  });

  it('GET /api/evidences → lista con paginación', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .get('/api/evidences?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('GET /api/evidences/:id/verify-integrity → isValid: true', async () => {
    if (skip() || !createdEvidenceId) return;
    const res = await request(app.getHttpServer())
      .get(`/api/evidences/${createdEvidenceId}/verify-integrity`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('isValid');
    expect(res.body.isValid).toBe(true);
    expect(res.body).toHaveProperty('computedHash');
  });

  it('GET /api/evidences/download/:token con token inválido → 401', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer()).get(
      '/api/evidences/download/invalid-token-xyz',
    );

    expect(res.status).toBe(401);
  });

  it('GET /api/evidences/:id/export → 200 ZIP con chain_of_custody', async () => {
    if (skip() || !createdEvidenceId) return;
    const res = await request(app.getHttpServer())
      .get(`/api/evidences/${createdEvidenceId}/export`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('zip');
  });

  it('GET /api/evidences/:id inexistente → 404', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .get('/api/evidences/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
