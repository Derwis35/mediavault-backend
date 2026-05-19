import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { Session } from './entities/session.entity';
import { RoleName } from '../users/entities/role.entity';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../redis/redis.service';

const mockUserRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
};

const mockSessionRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock_access_token'),
  decode: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    const config: Record<string, string> = {
      'jwt.refreshSecret': 'test_refresh_secret',
      'jwt.refreshExpiresIn': '8h',
    };
    return config[key] ?? undefined;
  }),
};

const mockRedisService = {
  set: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(undefined),
  exists: jest.fn().mockResolvedValue(false),
};

const mockAuditService = {
  logAction: jest.fn().mockResolvedValue(undefined),
};

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(Session), useValue: mockSessionRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    mockJwtService.sign.mockReturnValue('mock_access_token');
    mockRedisService.exists.mockResolvedValue(false);
    mockAuditService.logAction.mockResolvedValue(undefined);
  });

  describe('login', () => {
    let mockUser: Partial<User & { role: { id: string; name: RoleName } }>;

    beforeEach(async () => {
      const passwordHash = await bcrypt.hash('Test1234!', 10);
      mockUser = {
        id: 'user-uuid-123',
        email: 'test@example.com',
        passwordHash,
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        role: { id: 'role-uuid', name: RoleName.OPERATOR },
      };
    });

    it('should return accessToken and user data on successful login', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      const sessionMock = { id: 'session-uuid', ...mockUser };
      mockSessionRepository.create.mockReturnValue(sessionMock);
      mockSessionRepository.save.mockResolvedValue(sessionMock);

      const result = await authService.login(
        { email: 'test@example.com', password: 'Test1234!' },
        '127.0.0.1',
        'jest-agent',
      );

      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.id).toBe('user-uuid-123');
      expect(result.expiresIn).toBe(900);
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw UnauthorizedException when user email does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'noexiste@example.com', password: 'Test1234!' }, '', ''),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is incorrect', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        authService.login({ email: 'test@example.com', password: 'WrongPassword!' }, '', ''),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException when user account is inactive', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(
        authService.login({ email: 'test@example.com', password: 'Test1234!' }, '', ''),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should use generic error message that does not reveal whether email exists', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      try {
        await authService.login({ email: 'ghost@example.com', password: 'Test1234!' }, '', '');
      } catch (err) {
        expect((err as Error).message).toBe('Credenciales inválidas');
      }
    });
  });

  describe('logout', () => {
    it('should blacklist the access token in Redis and delete the session', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 900;
      mockJwtService.decode.mockReturnValue({ exp: futureExp });
      mockSessionRepository.delete.mockResolvedValue({ affected: 1 });

      await authService.logout('user-uuid', 'session-uuid', 'raw_access_token');

      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining('blacklist:'),
        '1',
        expect.any(Number),
      );
      expect(mockSessionRepository.delete).toHaveBeenCalledWith({ id: 'session-uuid' });
    });
  });

  describe('refresh', () => {
    it('should throw UnauthorizedException when session does not exist', async () => {
      mockSessionRepository.findOne.mockResolvedValue(null);

      await expect(authService.refresh('user-uuid', 'session-uuid')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when session is expired', async () => {
      const expiredSession = {
        id: 'session-uuid',
        user: { id: 'user-uuid', email: 'test@example.com', role: { name: RoleName.OPERATOR } },
        expiresAt: new Date(Date.now() - 60_000),
      };
      mockSessionRepository.findOne.mockResolvedValue(expiredSession);

      await expect(authService.refresh('user-uuid', 'session-uuid')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return new accessToken when session is valid', async () => {
      const validSession = {
        id: 'session-uuid',
        user: { id: 'user-uuid', email: 'test@example.com', role: { name: RoleName.OPERATOR } },
        expiresAt: new Date(Date.now() + 3_600_000),
      };
      mockSessionRepository.findOne.mockResolvedValue(validSession);
      mockJwtService.sign.mockReturnValue('new_access_token');

      const result = await authService.refresh('user-uuid', 'session-uuid');

      expect(result.accessToken).toBe('new_access_token');
      expect(result.expiresIn).toBe(900);
    });
  });
});
