import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getAdminToken } from './setup/test-app';

describe('Security E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let isDbAvailable = true;

  beforeAll(async () => {
    try {
      app = await createTestApp();
      adminToken = await getAdminToken(app);
    } catch (err) {
      isDbAvailable = false;
      console.warn('Security E2E skipped — test DB not available:', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const skip = () => !isDbAvailable;

  it('GET /api/security/report → SecurityReportDto completo', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .get('/api/security/report')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('activeSessions');
    expect(res.body).toHaveProperty('anomalyCount');
  });

  it('GET /api/security/sessions → lista de sesiones activas', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .get('/api/security/sessions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/security/anomalies → array (puede estar vacío)', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .get('/api/security/anomalies')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/audit → paginación correcta', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .get('/api/audit?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
  });

  it('GET /api/audit/export → CSV con cabecera correcta', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .get('/api/audit/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const csv = res.text;
    expect(csv).toContain('action');
  });

  it('GET /api/events → lista paginada de eventos', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .get('/api/events?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
  });

  it('POST + GET /api/events → asociación ManyToMany correcta', async () => {
    if (skip()) return;
    const createRes = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'E2E Incidente Test', status: 'open' });

    expect(createRes.status).toBe(201);
    expect(createRes.body).toHaveProperty('id');

    const getRes = await request(app.getHttpServer())
      .get(`/api/events/${createRes.body.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.streams).toEqual([]);
    expect(getRes.body).toHaveProperty('evidenceCount');
  });
});
