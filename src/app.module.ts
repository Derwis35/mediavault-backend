import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import wowzaConfig from './config/wowza.config';
import { RedisModule } from './modules/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StreamsModule } from './modules/streams/streams.module';
import { EvidencesModule } from './modules/evidences/evidences.module';
import { EventsModule } from './modules/events/events.module';
import { WowzaModule } from './modules/wowza/wowza.module';
import { AuditModule } from './modules/audit/audit.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { SecurityModule } from './modules/security/security.module';
import { HealthModule } from './modules/health/health.module';
import { WowzaServersModule } from './wowza-servers/wowza-servers.module';
import { DevicesModule } from './modules/devices/devices.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AuditService } from './modules/audit/audit.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, redisConfig, wowzaConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.database'),
        ssl: configService.get<boolean>('database.ssl'),
        entities: [
          __dirname + '/modules/**/*.entity.{ts,js}',
          __dirname + '/wowza-servers/**/*.entity.{ts,js}',
        ],
        migrations: [__dirname + '/database/migrations/*.{ts,js}'],
        synchronize: true,
        logging: false,
      }),
    }),
    RedisModule,
    AuthModule,
    UsersModule,
    StreamsModule,
    EvidencesModule,
    EventsModule,
    WowzaModule,
    AuditModule,
    GatewayModule,
    IngestionModule,
    SecurityModule,
    HealthModule,
    WowzaServersModule,
    DevicesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    {
      provide: APP_INTERCEPTOR,
      useFactory: (reflector: Reflector, auditService: AuditService) =>
        new AuditInterceptor(reflector, auditService),
      inject: [Reflector, AuditService],
    },
  ],
})
export class AppModule {}
