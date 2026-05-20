import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { User } from '../users/entities/user.entity';
import { Session } from './entities/session.entity';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';

interface JwtDecoded {
  exp?: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
  ) {}

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async login(dto: LoginDto, ip: string, userAgent: string) {
    const startTime = Date.now();
    this.logger.log(`[LOGIN] Intento de login para: ${dto.email} desde IP: ${ip}`);

    const user = await this.userRepository.findOne({
      where: { email: dto.email },
      relations: ['role'],
    });

    if (!user) {
      this.logger.warn(`[LOGIN] Usuario no encontrado: ${dto.email}`);
    } else {
      this.logger.log(`[LOGIN] Usuario encontrado: ${user.email} | activo: ${user.isActive} | rol: ${user.role?.name}`);
    }

    // Always run bcrypt compare to prevent user-enumeration via timing
    const dummyHash = '$2b$12$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const passwordHash = user?.passwordHash ?? dummyHash;
    const isPasswordValid = await bcrypt.compare(dto.password, passwordHash);
    this.logger.log(`[LOGIN] Verificación de password: ${isPasswordValid ? 'OK' : 'FALLÓ'}`);

    // Enforce minimum 200ms response time against timing attacks
    const elapsed = Date.now() - startTime;
    if (elapsed < 200) {
      await new Promise<void>((resolve) => setTimeout(resolve, 200 - elapsed));
    }

    if (!user || !isPasswordValid) {
      this.logger.warn(`[LOGIN] Rechazado — usuario: ${!user ? 'no existe' : 'existe'} | password: ${isPasswordValid ? 'válida' : 'inválida'}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isActive) {
      this.logger.warn(`[LOGIN] Rechazado — cuenta deshabilitada: ${user.email}`);
      throw new ForbiddenException('Cuenta deshabilitada');
    }

    const sessionId = randomUUID();
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret') ?? 'jwt_refresh_secret';
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn') ?? '8h';

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role.name,
      sessionId,
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id, sessionId },
      { secret: refreshSecret, expiresIn: refreshExpiresIn as unknown as number },
    );

    const session = this.sessionRepository.create({
      user,
      tokenHash: this.sha256(accessToken),
      refreshTokenHash: this.sha256(refreshToken),
      ipAddress: ip,
      userAgent,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });
    // Pre-assign UUID so the session ID matches the JWT payload
    (session as Session & { id: string }).id = sessionId;
    await this.sessionRepository.save(session);

    await this.auditService.logAction('LOGIN', 'User', user.id, user.id, ip);
    this.logger.log(`[LOGIN] Exitoso — usuario: ${user.email} | sessionId: ${sessionId}`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: { name: user.role.name },
      },
      expiresIn: 900,
    };
  }

  async refresh(userId: string, sessionId: string) {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, user: { id: userId } },
      relations: ['user', 'user.role'],
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    const { user } = session;

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role.name,
      sessionId,
    });

    return { accessToken, expiresIn: 900 };
  }

  async logout(userId: string, sessionId: string, rawAccessToken: string): Promise<void> {
    try {
      const decoded = this.jwtService.decode(rawAccessToken) as JwtDecoded | null;
      if (decoded?.exp) {
        const ttl = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
        if (ttl > 0) {
          await this.redisService.set(`blacklist:${this.sha256(rawAccessToken)}`, '1', ttl);
        }
      }
    } catch (err) {
      this.logger.warn('Could not blacklist token during logout');
    }

    await this.sessionRepository.delete({ id: sessionId });
    await this.auditService.logAction('LOGOUT', 'User', userId, userId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionRepository.delete({ user: { id: userId } });
    await this.auditService.logAction('LOGOUT_ALL', 'User', userId, userId);
  }

  async getActiveSessions(userId: string) {
    return this.sessionRepository.find({
      where: { user: { id: userId } },
      select: ['id', 'ipAddress', 'userAgent', 'expiresAt', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async revokeSession(
    sessionId: string,
    requestingUserId: string,
    requestingRole: string,
  ): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['user'],
    });

    if (!session) return;

    if (session.user.id !== requestingUserId && requestingRole !== 'admin') {
      throw new ForbiddenException('No tienes permisos para revocar esta sesión');
    }

    await this.sessionRepository.delete({ id: sessionId });
  }
}
