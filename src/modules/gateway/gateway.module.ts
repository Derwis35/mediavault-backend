import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { StreamsModule } from '../streams/streams.module';
import { WowzaModule } from '../wowza/wowza.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { GatewayAuthGuard } from './gateway-auth.guard';
import { StreamingGateway } from './streaming.gateway';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret') ?? 'jwt_secret',
      }),
    }),
    forwardRef(() => StreamsModule),
    WowzaModule,
    IngestionModule,
  ],
  providers: [StreamingGateway, GatewayAuthGuard],
  exports: [StreamingGateway],
})
export class GatewayModule {}
