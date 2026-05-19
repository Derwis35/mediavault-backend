import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { AuditService } from '../../modules/audit/audit.service';
import { AUDIT_KEY, AuditMetadata } from '../decorators/audit.decorator';

interface AuthUser {
  userId?: string;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMetadata | undefined>(AUDIT_KEY, context.getHandler());
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const userId = req.user?.userId;

    const forwarded = req.headers['x-forwarded-for'];
    const ipAddress =
      (typeof forwarded === 'string' ? forwarded : forwarded?.[0])?.split(',')[0]?.trim() ??
      req.ip ??
      undefined;

    return next.handle().pipe(
      tap(() => {
        const params = req.params as Record<string, string>;
        const body = req.body as Record<string, unknown>;
        const entityId = params['id'] ?? (body?.['id'] as string | undefined);

        void this.auditService.log({
          action: meta.action,
          entityType: meta.entityType,
          entityId,
          userId,
          ipAddress,
        });
      }),
    );
  }
}
