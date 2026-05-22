import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Role, RoleName } from './entities/role.entity';
import { Session } from '../auth/entities/session.entity';
import { SecurityService } from '../security/security.service';
import { AuditService } from '../audit/audit.service';
import { StreamingGateway } from '../gateway/streaming.gateway';

const mockRole: Partial<Role> = {
  id: 'role-uuid',
  name: RoleName.OPERATOR,
  description: 'Operator role',
};

const mockUser: Partial<User> = {
  id: 'user-uuid',
  email: 'test@test.com',
  passwordHash: '$2b$12$hashed',
  firstName: 'Test',
  lastName: 'User',
  isActive: true,
  role: mockRole as Role,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const mockAdminUser: Partial<User> = {
  ...mockUser,
  id: 'admin-uuid',
  email: 'admin@test.com',
  role: { id: 'admin-role-uuid', name: RoleName.ADMIN } as Role,
};

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<Repository<User>>;
  let roleRepository: jest.Mocked<Repository<Role>>;
  let sessionRepository: jest.Mocked<Repository<Session>>;
  let securityService: jest.Mocked<Pick<SecurityService, 'revokeAllUserSessions' | 'getActiveSessions'>>;
  let auditService: jest.Mocked<Pick<AuditService, 'log' | 'findByUser'>>;
  let gateway: jest.Mocked<Pick<StreamingGateway, 'emitAlert'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            count: jest.fn(),
            softDelete: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Role),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Session),
          useValue: {
            find: jest.fn(),
            count: jest.fn(),
            findOne: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: SecurityService,
          useValue: {
            revokeAllUserSessions: jest.fn(),
            getActiveSessions: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
            findByUser: jest.fn(),
          },
        },
        {
          provide: StreamingGateway,
          useValue: {
            emitAlert: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get(getRepositoryToken(User));
    roleRepository = module.get(getRepositoryToken(Role));
    sessionRepository = module.get(getRepositoryToken(Session));
    securityService = module.get(SecurityService);
    auditService = module.get(AuditService);
    gateway = module.get(StreamingGateway);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('throws ConflictException if idNumber already exists', async () => {
      roleRepository.findOne.mockResolvedValueOnce(mockRole as Role);
      userRepository.findOne.mockResolvedValueOnce(mockUser as User);

      await expect(
        service.create(
          {
            email: 'test@test.com',
            password: 'Pass123!',
            firstName: 'Test',
            lastName: 'User',
            role: 'operator',
            idType: 'cedula',
            idNumber: '12345678',
          },
          'admin-id',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('hashes the password before saving', async () => {
      roleRepository.findOne.mockResolvedValueOnce(mockRole as Role);
      userRepository.findOne.mockResolvedValueOnce(null);
      userRepository.create.mockReturnValueOnce(mockUser as User);
      userRepository.save.mockResolvedValueOnce(mockUser as User);

      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashed-pw');

      await service.create(
        {
          email: 'new@test.com',
          password: 'PlainPass123',
          firstName: 'Test',
          lastName: 'User',
          role: 'operator',
          idType: 'cedula',
          idNumber: '99887766',
        },
        'admin-id',
      );

      expect(bcrypt.hash).toHaveBeenCalledWith('PlainPass123', 12);
    });

    it('never returns password_hash in response DTO', async () => {
      roleRepository.findOne.mockResolvedValueOnce(mockRole as Role);
      userRepository.findOne.mockResolvedValueOnce(null);
      userRepository.create.mockReturnValueOnce(mockUser as User);
      userRepository.save.mockResolvedValueOnce(mockUser as User);
      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashed-pw');

      const result = await service.create(
        {
          email: 'new@test.com',
          password: 'PlainPass123',
          firstName: 'Test',
          lastName: 'User',
          role: 'operator',
          idType: 'placa',
          idNumber: '55443322',
        },
        'admin-id',
      );

      expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).password_hash).toBeUndefined();
    });
  });

  // ─── deactivate() ─────────────────────────────────────────────────────────

  describe('deactivate()', () => {
    it('throws BadRequestException if deactivating own account', async () => {
      userRepository.findOne.mockResolvedValueOnce(mockAdminUser as User);

      await expect(service.deactivate('admin-uuid', 'admin-uuid')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if deactivating the last active admin', async () => {
      userRepository.findOne.mockResolvedValueOnce(mockAdminUser as User);

      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValueOnce(1),
      };
      userRepository.createQueryBuilder.mockReturnValueOnce(mockQb as never);

      await expect(service.deactivate('admin-uuid', 'other-admin-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('revokes all active sessions on deactivation', async () => {
      const supervisorUser: Partial<User> = {
        ...mockUser,
        id: 'supervisor-uuid',
        role: { id: 'role-id', name: RoleName.SUPERVISOR } as Role,
      };
      userRepository.findOne.mockResolvedValueOnce(supervisorUser as User);
      userRepository.save.mockResolvedValueOnce(supervisorUser as User);
      (securityService.revokeAllUserSessions as jest.Mock).mockResolvedValueOnce(2);

      await service.deactivate('supervisor-uuid', 'admin-id');

      expect(securityService.revokeAllUserSessions).toHaveBeenCalledWith(
        'supervisor-uuid',
        'admin-id',
      );
    });
  });

  // ─── changeOwnPassword() ──────────────────────────────────────────────────

  describe('changeOwnPassword()', () => {
    it('throws BadRequestException if passwords do not match', async () => {
      await expect(
        service.changeOwnPassword(
          'user-id',
          { newPassword: 'Pass123!', confirmPassword: 'Different123!', currentPassword: 'old' },
          'session-id',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException if currentPassword is wrong', async () => {
      userRepository.findOne.mockResolvedValueOnce(mockUser as User);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        service.changeOwnPassword(
          'user-uuid',
          { newPassword: 'NewPass123!', confirmPassword: 'NewPass123!', currentPassword: 'wrong' },
          'session-id',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('preserves current session when revoking others', async () => {
      const future = new Date(Date.now() + 3_600_000);
      userRepository.findOne.mockResolvedValueOnce(mockUser as User);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('new-hash');
      userRepository.save.mockResolvedValueOnce(mockUser as User);
      sessionRepository.find.mockResolvedValueOnce([
        { id: 'current-session', expiresAt: future } as Session,
        { id: 'other-session', expiresAt: future } as Session,
      ]);
      sessionRepository.delete.mockResolvedValueOnce({ affected: 1 } as never);

      await service.changeOwnPassword(
        'user-uuid',
        { newPassword: 'NewPass123!', confirmPassword: 'NewPass123!', currentPassword: 'OldPass123!' },
        'current-session',
      );

      expect(sessionRepository.delete).toHaveBeenCalledWith(['other-session']);
    });
  });

  // ─── changePasswordByAdmin() ──────────────────────────────────────────────

  describe('changePasswordByAdmin()', () => {
    it('does not require currentPassword', async () => {
      userRepository.findOne.mockResolvedValueOnce(mockUser as User);
      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('new-hash');
      userRepository.save.mockResolvedValueOnce(mockUser as User);
      (securityService.revokeAllUserSessions as jest.Mock).mockResolvedValueOnce(0);

      // No currentPassword in DTO — should succeed without throwing
      await expect(
        service.changePasswordByAdmin('user-uuid', { newPassword: 'NewPass123!' }, 'admin-id'),
      ).resolves.toBeUndefined();
    });
  });

  // ─── getUserAuditHistory() ────────────────────────────────────────────────

  describe('getUserAuditHistory()', () => {
    it('throws ForbiddenException if non-admin accesses another user history', async () => {
      await expect(
        service.getUserAuditHistory('other-user-id', 'viewer-user-id', 'viewer'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── remove() ─────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('throws BadRequestException when removing own account', async () => {
      userRepository.findOne.mockResolvedValueOnce(mockAdminUser as User);

      await expect(service.remove('admin-uuid', 'admin-uuid')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
