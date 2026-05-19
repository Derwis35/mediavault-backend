import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { createHash } from 'crypto';
import { Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
}

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    return this.validateClient(client);
  }

  async validateClient(client: Socket): Promise<boolean> {
    const authToken = client.handshake?.auth?.token as string | undefined;
    if (!authToken) throw new WsException('Unauthorized');

    const token = authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;

    try {
      const secret = this.configService.get<string>('jwt.secret') ?? 'jwt_secret';
      const payload = this.jwtService.verify<JwtPayload>(token, { secret });

      const tokenHash = createHash('sha256').update(token).digest('hex');
      const isBlacklisted = await this.redisService.exists(`blacklist:${tokenHash}`);
      if (isBlacklisted) throw new WsException('Token revocado');

      client.data.user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        sessionId: payload.sessionId,
      };

      return true;
    } catch (err) {
      if (err instanceof WsException) throw err;
      throw new WsException('Unauthorized');
    }
  }
}
