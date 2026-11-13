import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { concatMap, dematerialize, materialize } from 'rxjs';
import type { Observable } from 'rxjs';
import { PrismaService } from '../../db/prisma.service.js';
import type { AuthenticatedRequest } from './auth.security.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) return next.handle();
    const path = new URL(request.originalUrl, 'http://local').pathname;
    const requestId = request.auditRequestId ?? randomUUID();
    await this.prisma.eventoAuditoria.create({
      data: {
        actorUsuarioId: request.authUser?.id,
        accion: 'MUTATION_REQUESTED',
        ruta: path,
        metodo: request.method.toUpperCase(),
        resultado: 'REQUESTED',
        requestId,
        metadata: { params: request.params, phase: 'requested' },
      },
    });
    return next.handle().pipe(
      materialize(),
      concatMap(async (notification) => {
        if (notification.kind === 'N') {
          try {
            await this.recordTerminal(request, path, requestId, 'MUTATION_SUCCEEDED', 'SUCCESS', notification.value);
          } catch {
            throw new ServiceUnavailableException('La operación se procesó, pero no se pudo confirmar su auditoría. Conserva el requestId y solicita revisión antes de reintentar.');
          }
        } else if (notification.kind === 'E') {
          const error = notification.error;
          try {
            await this.recordTerminal(request, path, requestId, 'MUTATION_FAILED', 'FAILED', undefined, {
              httpStatus: error instanceof HttpException ? error.getStatus() : 500,
            });
          } catch {
            throw new ServiceUnavailableException('La operación falló y su resultado de auditoría quedó pendiente. Conserva el requestId para revisión.');
          }
        }
        return notification;
      }),
      dematerialize(),
    );
  }

  private async recordTerminal(request: AuthenticatedRequest, path: string, requestId: string, action: string, result: string, responseBody?: unknown, extraMetadata: Record<string, unknown> = {}): Promise<void> {
    const targetId = responseBody && typeof responseBody === 'object' && 'id' in responseBody
      ? String((responseBody as { id: unknown }).id)
      : undefined;
    const metadata = { params: request.params, ...(targetId ? { targetId } : {}), ...extraMetadata };
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO "EventoAuditoria" ("actorUsuarioId", "accion", "ruta", "metodo", "resultado", "requestId", "metadata")
      VALUES (${request.authUser?.id ?? null}, ${action}, ${path}, ${request.method.toUpperCase()}, ${result}, ${requestId}, ${JSON.stringify(metadata)}::jsonb)
      ON CONFLICT ("requestId") WHERE "requestId" IS NOT NULL AND "accion" IN ('MUTATION_SUCCEEDED', 'MUTATION_FAILED')
      DO NOTHING
    `;
    if (inserted === 1) return;
    const existing = await this.prisma.eventoAuditoria.findFirst({
      where: { requestId, accion: { in: ['MUTATION_SUCCEEDED', 'MUTATION_FAILED'] } },
      select: { accion: true, resultado: true },
    });
    if (existing?.accion !== action || existing.resultado !== result) {
      throw new Error('El requestId ya tiene un resultado terminal diferente.');
    }
  }
}
