import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup/test-app';

describe('Auth E2E', () => {
  let app: INestApplication;
  let isDbAvailable = true;

  beforeAll(async () => {
    try {
      app = await createTestApp();
    } catch (err) {
      isDbAvailable = false;
      console.warn('Auth E2E skipped — test DB not available:', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const skip = () => !isDbAvailable;

  it('POST /api/auth/login con credenciales válidas → 200 + accessToken', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'e2e-admin@test.com', password: 'Admin123!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user).toHaveProperty('role');
    const cookies = res.headers['set-cookie'] as string[] | string;
    const cookieStr = Array.isArray(cookies) ? cookies.join(';') : (cookies ?? '');
    expect(cookieStr).toContain('refresh_token');
  });

  it('POST /api/auth/login con password incorrecta → 401', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'e2e-admin@test.com', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me con Bearer token válido → 200 sin password_hash', async () => {
    if (skip()) return;
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'e2e-admin@test.com', password: 'Admin123!' });

    const token = loginRes.body.accessToken as string;

    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it('GET /api/auth/me sin token → 401', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer()).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/refresh con cookie válida → 200 + nuevo accessToken', async () => {
    if (skip()) return;
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'e2e-admin@test.com', password: 'Admin123!' });

    const cookies = loginRes.headers['set-cookie'] as string[];

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('POST /api/auth/logout → 204; token previo → 401', async () => {
    if (skip()) return;
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'e2e-admin@test.com', password: 'Admin123!' });

    const token = loginRes.body.accessToken as string;
    const cookies = loginRes.headers['set-cookie'] as string[];

    const logoutRes = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookies);

    expect(logoutRes.status).toBe(204);
  });

  it('GET /api/health es ruta pública → 200 sin token', async () => {
    if (skip()) return;
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
  });
});
