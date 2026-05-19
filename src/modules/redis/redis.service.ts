import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private available = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    try {
      const password = this.configService.get<string>('redis.password');
      this.client = new Redis({
        host: this.configService.get<string>('redis.host') || 'localhost',
        port: this.configService.get<number>('redis.port') || 6379,
        password: password || undefined,
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: 5000,
      });

      this.client.on('error', (err: Error) => {
        if (this.available) {
          this.logger.warn(`Redis error: ${err.message}`);
          this.available = false;
        }
      });

      await this.client.connect();
      await this.client.ping();
      this.available = true;
      this.logger.log('Redis connected successfully');
    } catch (err) {
      this.logger.warn(
        'Redis unavailable at startup — running in degraded mode (token blacklist disabled)',
      );
      this.client = null;
      this.available = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.available || !this.client) return;
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis set failed for key ${key}`);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.available || !this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.available || !this.client) return;
    try {
      await this.client.del(key);
    } catch {
      this.logger.warn(`Redis del failed for key ${key}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.available || !this.client) return false;
    try {
      return (await this.client.exists(key)) === 1;
    } catch {
      return false;
    }
  }

  async getOrSet<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    if (this.available && this.client) {
      try {
        const cached = await this.client.get(key);
        if (cached !== null) {
          return JSON.parse(cached) as T;
        }
      } catch {
        /* fall through to fn */
      }
      const value = await fn();
      try {
        await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      } catch {
        /* ignore cache write failure */
      }
      return value;
    }
    return fn();
  }

  async invalidate(key: string): Promise<void> {
    await this.del(key);
  }

  async ping(): Promise<boolean> {
    if (!this.available || !this.client) return false;
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  async countKeys(pattern: string): Promise<number> {
    if (!this.available || !this.client) return 0;
    try {
      let count = 0;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        count += keys.length;
      } while (cursor !== '0');
      return count;
    } catch {
      return 0;
    }
  }
}
