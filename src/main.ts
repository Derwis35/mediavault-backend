import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableCors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  });
  app.enableShutdownHooks();

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('MediaVault API')
      .setDescription('Plataforma enterprise de gestión de evidencias multimedia')
      .setVersion('1.0.0')
      .addBearerAuth()
      .addTag('auth', 'Autenticación y sesiones')
      .addTag('streams', 'Gestión de streams de video')
      .addTag('evidences', 'Evidencias forenses')
      .addTag('events', 'Eventos operacionales')
      .addTag('users', 'Gestión de usuarios')
      .addTag('security', 'Seguridad y sesiones')
      .addTag('audit', 'Registro de auditoría')
      .addTag('wowza', 'Integración Wowza Streaming Engine')
      .addTag('health', 'Health checks del sistema')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

bootstrap();
