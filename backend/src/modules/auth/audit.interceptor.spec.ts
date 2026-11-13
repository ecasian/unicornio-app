import { BadRequestException, ServiceUnavailableException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { lastValueFrom, of, throwError } from 'rxjs';
import type { PrismaService } from '../../db/prisma.service.js';
import { AuditInterceptor } from './audit.interceptor.js';

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('auditoría HTTP', () => {
  it('correlaciona REQUESTED/SUCCEEDED con requestId del servidor y omite el cuerpo', async () => {
    const create = vi.fn().mockResolvedValue({});
    const executeRaw = vi.fn().mockResolvedValue(1);
    const interceptor = new AuditInterceptor({ eventoAuditoria: { create }, $executeRaw: executeRaw } as unknown as PrismaService);
    const request = {
      method: 'POST', originalUrl: '/api/auth/users?ignored=1', auditRequestId: 'server-request-id',
      headers: { 'x-request-id': 'client-controlled-id' }, authUser: { id: 17 }, params: { id: '4' },
      body: { password: 'must-never-be-recorded' },
    };
    const handler = { handle: () => of({ id: 44, passwordHash: 'not-audit-data' }) } as CallHandler;

    await expect(lastValueFrom(await interceptor.intercept(context(request), handler))).resolves.toEqual({ id: 44, passwordHash: 'not-audit-data' });
    expect(create).toHaveBeenCalledTimes(1);
    const requested = create.mock.calls[0][0].data;
    expect(requested).toMatchObject({ accion: 'MUTATION_REQUESTED', resultado: 'REQUESTED', actorUsuarioId: 17, requestId: 'server-request-id', ruta: '/api/auth/users' });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw.mock.calls[0][2]).toBe('MUTATION_SUCCEEDED');
    expect(JSON.stringify([create.mock.calls, executeRaw.mock.calls])).toContain('targetId');
    expect(JSON.stringify([create.mock.calls, executeRaw.mock.calls])).not.toContain('must-never-be-recorded');
    expect(JSON.stringify([create.mock.calls, executeRaw.mock.calls])).not.toContain('not-audit-data');
    expect(JSON.stringify([create.mock.calls, executeRaw.mock.calls])).not.toContain('client-controlled-id');
  });

  it('registra fallos de validación con el mismo requestId y status HTTP', async () => {
    const create = vi.fn().mockResolvedValue({});
    const executeRaw = vi.fn().mockResolvedValue(1);
    const interceptor = new AuditInterceptor({ eventoAuditoria: { create }, $executeRaw: executeRaw } as unknown as PrismaService);
    const request = { method: 'POST', originalUrl: '/api/yogurt-base/lotes', auditRequestId: 'request-failed', headers: {}, authUser: { id: 9 }, params: {}, body: { password: 'secret' } };
    const handler = { handle: () => throwError(() => new BadRequestException()) } as CallHandler;

    await expect(lastValueFrom(await interceptor.intercept(context(request), handler))).rejects.toBeInstanceOf(BadRequestException);
    expect(create).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw.mock.calls[0][2]).toBe('MUTATION_FAILED');
    expect(JSON.stringify(executeRaw.mock.calls)).toContain('httpStatus');
    expect(JSON.stringify(create.mock.calls)).not.toContain('secret');
  });

  it('no registra FAILED si falla escribir SUCCEEDED después de una operación procesada', async () => {
    const create = vi.fn().mockResolvedValue({});
    const executeRaw = vi.fn().mockRejectedValue(new Error('db unavailable'));
    const interceptor = new AuditInterceptor({ eventoAuditoria: { create }, $executeRaw: executeRaw } as unknown as PrismaService);
    const request = { method: 'POST', originalUrl: '/api/propuestas-abastecimiento', auditRequestId: 'audit-write-failed', authUser: { id: 21 }, params: {} };
    const handler = { handle: () => of({ id: 55 }) } as CallHandler;

    await expect(lastValueFrom(await interceptor.intercept(context(request), handler))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(create).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('deja la solicitud pendiente y reporta indisponibilidad si falla registrar FAILED tras rollback', async () => {
    const create = vi.fn().mockResolvedValue({});
    const executeRaw = vi.fn().mockRejectedValue(new Error('db unavailable'));
    const interceptor = new AuditInterceptor({ eventoAuditoria: { create }, $executeRaw: executeRaw } as unknown as PrismaService);
    const request = { method: 'PUT', originalUrl: '/api/sucursales/4/stock-objetivo', auditRequestId: 'failure-audit-pending', authUser: { id: 22 }, params: {} };
    const handler = { handle: () => throwError(() => new BadRequestException()) } as CallHandler;

    await expect(lastValueFrom(await interceptor.intercept(context(request), handler))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(create).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw.mock.calls[0][2]).toBe('MUTATION_FAILED');
  });

  it('trata un reintento del mismo resultado terminal como idempotente', async () => {
    const create = vi.fn().mockResolvedValue({});
    const executeRaw = vi.fn().mockResolvedValue(0);
    const findFirst = vi.fn().mockResolvedValue({ accion: 'MUTATION_SUCCEEDED', resultado: 'SUCCESS' });
    const interceptor = new AuditInterceptor({ eventoAuditoria: { create, findFirst }, $executeRaw: executeRaw } as unknown as PrismaService);
    const request = { method: 'PATCH', originalUrl: '/api/clientes/4', auditRequestId: 'retry-same-terminal', authUser: { id: 23 }, params: { id: '4' } };
    const handler = { handle: () => of({ id: 4 }) } as CallHandler;

    await expect(lastValueFrom(await interceptor.intercept(context(request), handler))).resolves.toEqual({ id: 4 });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
