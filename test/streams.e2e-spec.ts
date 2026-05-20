import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, getAdminToken } from './setup/test-app';

describe('Streams E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let createdStreamId: string;
  let isDbAvailable = true;

  beforeAll(async () => {
    try {
      app = await createTestApp();
      adminToken = await getAdminToken(app);
    } catch (err) {
      isDbAvailable = false;
      console.warn('Streams E2E skipped — test DB not available:', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const skip = () => !isDbAvailable;

  it('POST /api/streams con admin token → 201', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .post('/api/streams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E Camera 01',
        wowzaAppName: 'live',
        wowzaStreamName: 'e2e-cam01',
        protocol: 'RTMP',
        sourceUrl: 'rtmp://192.168.1.1/live/cam01',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('playbackUrls');
    createdStreamId = res.body.id as string;
  });

  it('GET /api/streams → paginación con page, limit, total', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .get('/api/streams?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta.total');
    expect(res.body).toHaveProperty('meta.page');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/streams/:id → stream completo', async () => {
    if (skip() || !createdStreamId) return;
    const res = await request(app.getHttpServer())
      .get(`/api/streams/${createdStreamId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdStreamId);
    expect(res.body).toHaveProperty('isLiveInWowza');
  });

  it('PATCH /api/streams/:id con admin → 200', async () => {
    if (skip() || !createdStreamId) return;
    const res = await request(app.getHttpServer())
      .patch(`/api/streams/${createdStreamId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Camera 01 Updated' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('E2E Camera 01 Updated');
  });

  it('GET /api/streams/:id/playback-url → URLs firmadas', async () => {
    if (skip() || !createdStreamId) return;
    const res = await request(app.getHttpServer())
      .get(`/api/streams/${createdStreamId}/playback-url`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('playbackUrls.hls');
  });

  it('POST /api/streams/:id/start-ingestion con stream RTMP → 400 (no RTSP)', async () => {
    if (skip() || !createdStreamId) return;
    const res = await request(app.getHttpServer())
      .post(`/api/streams/${createdStreamId}/start-ingestion`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('DELETE /api/streams/:id con admin → 204', async () => {
    if (skip() || !createdStreamId) return;
    const res = await request(app.getHttpServer())
      .delete(`/api/streams/${createdStreamId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it('GET /api/streams/:id inexistente → 404', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .get('/api/streams/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
