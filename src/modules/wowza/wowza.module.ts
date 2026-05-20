import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WowzaServersModule } from '../../wowza-servers/wowza-servers.module';
import { WowzaSecureTokenService } from './wowza-secure-token.service';
import { WowzaController } from './wowza.controller';
import { WowzaService } from './wowza.service';

@Module({
  imports: [
    HttpModule.register({ timeout: 10_000, maxRedirects: 3 }),
    AuditModule,
    WowzaServersModule,
  ],
  controllers: [WowzaController],
  providers: [WowzaService, WowzaSecureTokenService],
  exports: [WowzaService, WowzaSecureTokenService],
})
export class WowzaModule {}
