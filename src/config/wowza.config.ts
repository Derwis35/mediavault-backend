import { registerAs } from '@nestjs/config';

export default registerAs('wowza', () => ({
  host: process.env.WOWZA_HOST || 'localhost',
  port: Number(process.env.WOWZA_PORT || 8087),
  user: process.env.WOWZA_USER || 'admin',
  password: process.env.WOWZA_PASSWORD || '',
  streamPort: Number(process.env.WOWZA_STREAM_PORT || 1935),
  secureTokenSecret: process.env.WOWZA_SECURE_TOKEN_SECRET || '',
}));
