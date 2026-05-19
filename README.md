# MediaVault Backend

Plataforma enterprise de gestión de evidencias multimedia para operaciones policiales. Incluye streaming en tiempo real con Wowza, cadena de custodia forense SHA-256, auditoría completa, RBAC y WebSocket para monitoreo en vivo.

## Stack

| Tecnología | Versión | Rol |
|---|---|---|
| NestJS | 11 | Framework principal |
| TypeScript | 5 strict | Lenguaje |
| TypeORM | 0.3 | ORM (PostgreSQL) |
| PostgreSQL | 15+ | Base de datos principal |
| Redis | 7+ | Blacklist JWT + caché |
| Socket.io | 4 | WebSocket /monitoring |
| Wowza Streaming Engine | 4+ | Servidor de streaming |
| FFmpeg | 6+ | Ingesta RTSP → RTMP |
| bcrypt | 5 | Hashing de contraseñas |
| @nestjs/swagger | — | Documentación OpenAPI |
| @nestjs/terminus | — | Health checks |

## Requisitos previos

- Node.js 20+
- PostgreSQL 15+ (con extensiones `uuid-ossp`)
- Redis 7+
- FFmpeg en PATH (`ffmpeg --version`)
- Wowza Streaming Engine (o modo degradado sin streaming)

## Setup local

```bash
# 1. Clonar e instalar
npm install

# 2. Configurar entorno
cp .env.example .env
# Editar .env con los valores reales

# 3. Crear base de datos
createdb mediavault

# 4. Ejecutar migraciones
npm run migration:run

# 5. Cargar datos iniciales (roles + admin)
npm run seed

# 6. Iniciar en modo desarrollo
npm run start:dev
```

La API estará disponible en `http://localhost:3000/api`.
La documentación Swagger en `http://localhost:3000/api/docs`.

## Comandos útiles

```bash
npm run start:dev           # Servidor con hot-reload
npm run build               # Compilar TypeScript
npm run test                # Tests unitarios (101+ tests)
npm run test:cov            # Tests con cobertura
npm run test:e2e            # Tests E2E (requiere mediavault_test DB)
npm run migration:run       # Aplicar migraciones pendientes
npm run migration:revert    # Revertir última migración
npm run seed                # Cargar datos semilla
```

## Módulos

| Módulo | Endpoints | Descripción |
|---|---|---|
| **auth** | `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/me` | JWT + refresh tokens HttpOnly cookie + Redis blacklist |
| **users** | `/users`, `/users/me`, `/users/:id` | CRUD admin, perfil, cambio contraseña, soft delete |
| **streams** | `/streams`, `/streams/:id` | CRUD streams, ingesta RTSP→RTMP, URLs firmadas Wowza |
| **evidences** | `/evidences`, `/evidences/snapshot` | Cadena custodia SHA-256, export ZIP, descarga firmada |
| **events** | `/events`, `/events/:id` | Incidentes operacionales, asociación streams/evidencias |
| **wowza** | `/wowza/status`, `/wowza/apps` | Proxy Wowza REST API + secure token |
| **security** | `/security/sessions`, `/security/report` | Gestión sesiones, detección anomalías |
| **audit** | `/audit`, `/audit/export` | Log auditoría completo, export CSV |
| **health** | `/health` | DB + Redis + disco + memoria + Wowza |
| **gateway** | WS `/monitoring` | Eventos tiempo real: stream status, alertas, evidencias |

## Arquitectura de seguridad

- **Autenticación**: JWT (15 min) + refresh token HttpOnly (8h)
- **RBAC**: 4 roles — `admin`, `supervisor`, `operator`, `viewer` — con `RolesGuard`
- **Blacklist**: tokens revocados en Redis; degradación graceful si Redis no disponible
- **Sesiones**: rastreadas en PostgreSQL con IP + user agent; revocación individual o masiva
- **Audit trail**: toda acción relevante registrada con userId, acción, entidad e IP
- **Forense**: SHA-256 por archivo; export ZIP con `chain_of_custody.json` + `integrity.txt`
- **Wowza secure tokens**: URLs de reproducción firmadas con TTL configurable

## Variables de entorno requeridas

Ver `.env.example` para la lista completa documentada.

Las variables críticas para producción:
- `JWT_SECRET` — mínimo 64 caracteres aleatorios
- `JWT_REFRESH_SECRET` — distinto de JWT_SECRET
- `DB_PASS` — contraseña PostgreSQL
- `WOWZA_SECURE_TOKEN_SECRET` — mínimo 32 caracteres
- `DB_SSL=true` — habilitar TLS para PostgreSQL en producción
- `NODE_ENV=production` — desactiva Swagger UI y habilita optimizaciones

## Docker (producción)

```bash
# Build
docker build -t mediavault-backend:latest .

# Run
docker run -d \
  --name mediavault-backend \
  -p 3000:3000 \
  --env-file .env \
  -v /data/mediavault/storage:/app/storage \
  mediavault-backend:latest
```

El healthcheck interno consulta `GET /api/health` cada 30 segundos.

## Tests E2E

Los tests E2E requieren una base de datos PostgreSQL de prueba:

```bash
createdb mediavault_test

# En .env o como variable de entorno:
DB_TEST_NAME=mediavault_test

npm run test:e2e
```

Los tests se ejecutan con `synchronize: true` sobre `mediavault_test` (se crea el esquema automáticamente).
Redis es reemplazado por `ioredis-mock`; Wowza e Ingestion son mockeados.
