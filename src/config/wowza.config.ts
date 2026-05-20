import { registerAs } from '@nestjs/config';

export default registerAs('wowza', () => ({
  host: process.env.WOWZA_HOST || 'localhost',
  // portApi tiene preferencia sobre el alias legacy WOWZA_PORT
  portApi: Number(process.env.WOWZA_PORT_API || process.env.WOWZA_PORT || 8087),
  // portStream tiene preferencia sobre el alias legacy WOWZA_STREAM_PORT
  portStream: Number(process.env.WOWZA_PORT_STREAM || process.env.WOWZA_STREAM_PORT || 1935),
  portHls: Number(process.env.WOWZA_PORT_HLS || 8088),
  appName: process.env.WOWZA_APP_NAME || 'live',
  // apiUser tiene preferencia sobre el alias legacy WOWZA_USER
  apiUser: process.env.WOWZA_API_USER || process.env.WOWZA_USER || 'admin',
  // apiPassword tiene preferencia sobre el alias legacy WOWZA_PASSWORD
  apiPassword: process.env.WOWZA_API_PASSWORD || process.env.WOWZA_PASSWORD || '',
  streamLockKey: process.env.WOWZA_STREAM_LOCK_KEY || '',
  secureTokenSecret: process.env.WOWZA_SECURE_TOKEN_SECRET || '',
  // aliases legacy expuestos para no romper código existente
  port: Number(process.env.WOWZA_PORT_API || process.env.WOWZA_PORT || 8087),
  user: process.env.WOWZA_API_USER || process.env.WOWZA_USER || 'admin',
  password: process.env.WOWZA_API_PASSWORD || process.env.WOWZA_PASSWORD || '',
}));
