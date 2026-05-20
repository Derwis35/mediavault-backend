import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { WowzaService } from '../../src/modules/wowza/wowza.service';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service';

process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_TEST_NAME || 'mediavault_test';
process.env.JWT_SECRET = 'test-jwt-secret-minimum-64-characters-long-for-test-suite-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-64-chars-for-test-suite-only-xyz';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '8h';

const wowzaMock = {
  getServerStatus: jest.fn().mockResolvedValue({ isOnline: false, version: 'mock', uptime: 0 }),
  getIncomingStream: jest.fn().mockResolvedValue(null),
  buildPlaybackUrls: jest.fn().mockResolvedValue({
    hls: 'http://localhost:1935/live/test/playlist.m3u8',
    llHls: 'http://localhost:1935/live/test/playlist.m3u8?chunklist',
    dash: 'http://localhost:1935/live/test/manifest.mpd',
    rtmp: 'rtmp://localhost:1935/live/test',
    webrtc: 'wss://localhost:1935/live/test/webrtc',
  }),
  getConnections: jest.fn().mockResolvedValue({ total: 0, byApplication: {}, byProtocol: {}, connections: [] }),
  generateSecureToken: jest.fn().mockReturnValue('mock-secure-token'),
  getApplications: jest.fn().mockResolvedValue([]),
  createApplication: jest.fn().mockResolvedValue({ name: 'live' }),
  pushPublish: jest.fn().mockResolvedValue({}),
};

const ingestionMock = {
  startIngestion: jest.fn().mockResolvedValue({ status: 'running', pid: 12345 }),
  stopIngestion: jest.fn().mockResolvedValue(undefined),
  isRunning: jest.fn().mockReturnValue(false),
  getStatus: jest.fn().mockReturnValue({ status: 'idle', pid: null, reconnectAttempts: 0 }),
  restartIngestion: jest.fn().mockResolvedValue({ status: 'running', pid: 12346 }),
  getRunningStreams: jest.fn().mockReturnValue([]),
  onModuleInit: jest.fn().mockResolvedValue(undefined),
  onApplicationShutdown: jest.fn().mockResolvedValue(undefined),
};

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(WowzaService)
    .useValue(wowzaMock)
    .overrideProvider(IngestionService)
    .useValue(ingestionMock)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();

  await seedTestData(app);

  return app;
}

async function seedTestData(app: INestApplication): Promise<void> {
  const dataSource = app.get<DataSource>(getDataSourceToken());

  const roleRepo = dataSource.getRepository('Role');
  const userRepo = dataSource.getRepository('User');

  for (const name of ['admin', 'supervisor', 'operator', 'viewer']) {
    const existing = await roleRepo.findOne({ where: { name } });
    if (!existing) {
      await roleRepo.save({ name, description: `${name} role` });
    }
  }

  const adminRole = await roleRepo.findOne({ where: { name: 'admin' } });
  const existing = await userRepo.findOne({ where: { email: 'e2e-admin@test.com' } });
  if (!existing) {
    const passwordHash = await bcrypt.hash('Admin123!', 12);
    await userRepo.save({
      email: 'e2e-admin@test.com',
      passwordHash,
      firstName: 'E2E',
      lastName: 'Admin',
      isActive: true,
      role: adminRole,
    });
  }
}

export async function getToken(
  app: INestApplication,
  email: string,
  password: string,
): Promise<{ token: string; cookie: string }> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password });

  return {
    token: res.body.accessToken as string,
    cookie: (res.headers['set-cookie'] as string[] | string | undefined)?.[0] ?? '',
  };
}

export async function getAdminToken(app: INestApplication): Promise<string> {
  const { token } = await getToken(app, 'e2e-admin@test.com', 'Admin123!');
  return token;
}
