import { ExecutionContext, ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AuthSessionGuard, CsrfGuard, PermissionsGuard, RepartidorScopeGuard, resolveRequiredPermission } from './auth.guards.js';
import type { PrismaService } from '../../db/prisma.service.js';
import type { AuthService } from './auth.service.js';

function context(path: string, method: string, permissions: string[]): ExecutionContext {
  const request = { originalUrl: path, method, auditRequestId: 'request-test', authUser: { id: 17, permissions, roles: [], repartidorId: null } };
  return {
    getHandler: () => function route() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('permission matrix', () => {
  it.each([
    ['GET', '/api/auth/session', 'auth:session'],
    ['POST', '/api/auth/logout', 'auth:session'],
    ['GET', '/api/auth/users', 'usuarios:manage'],
    ['POST', '/api/auth/users', 'usuarios:manage'],
    ['PATCH', '/api/auth/users/3/active', 'usuarios:manage'],
    ['PATCH', '/api/auth/users/3/password', 'usuarios:manage'],
    ['PUT', '/api/auth/users/3/roles', 'usuarios:manage'],
    ['GET', '/api/auth/roles', 'usuarios:manage'],
    ['GET', '/api/auth/audit', 'auditoria:read'],
    ['GET', '/api/clientes', 'clientes:read'],
    ['GET', '/api/clientes/12', 'clientes:read'],
    ['POST', '/api/clientes', 'clientes:manage'],
    ['PATCH', '/api/clientes/12', 'clientes:manage'],
    ['GET', '/api/clientes/12/stock-objetivo', 'stock-cliente:read'],
    ['PUT', '/api/clientes/12/stock-objetivo', 'stock-cliente:manage'],
    ['GET', '/api/clientes/12/surtido-operativo', 'reparto:operate'],
    ['GET', '/api/clientes/12/registros-existencias/4', 'reparto:operate'],
    ['POST', '/api/clientes/12/registros-existencias', 'reparto:operate'],
    ['POST', '/api/clientes/12/registros-existencias/4/correcciones', 'reparto:operate'],
    ['POST', '/api/clientes/12/visitas', 'reparto:operate'],
    ['GET', '/api/sabores', 'catalogo:read'],
    ['GET', '/api/sabores/3', 'catalogo:read'],
    ['GET', '/api/sabores/3/presentaciones', 'catalogo:read'],
    ['POST', '/api/sabores', 'catalogo:manage'],
    ['PATCH', '/api/sabores/3', 'catalogo:manage'],
    ['PUT', '/api/sabores/3/presentaciones', 'catalogo:manage'],
    ['GET', '/api/presentaciones', 'catalogo:read'],
    ['GET', '/api/repartidores', 'repartidores:read'],
    ['GET', '/api/repartidores/3', 'repartidores:read'],
    ['POST', '/api/repartidores', 'repartidores:manage'],
    ['PATCH', '/api/repartidores/3', 'repartidores:manage'],
    ['GET', '/api/produccion', 'produccion:read'],
    ['GET', '/api/yogurt-base', 'produccion:read'],
    ['POST', '/api/yogurt-base/lotes', 'produccion:manage'],
    ['POST', '/api/yogurt-base/acondicionamientos', 'produccion:manage'],
    ['GET', '/api/admin/visitas', 'visitas:read'],
    ['GET', '/api/sucursales', 'sucursales:read'],
    ['GET', '/api/sucursales/sabores', 'sucursales:read'],
    ['POST', '/api/sucursales', 'sucursales:manage'],
    ['PATCH', '/api/sucursales/3', 'sucursales:manage'],
    ['GET', '/api/sucursales/3/stock-objetivo/comparacion', 'sucursales:read'],
    ['GET', '/api/sucursales/3/stock-objetivo', 'sucursales:read'],
    ['PUT', '/api/sucursales/3/stock-objetivo', 'sucursales:manage'],
    ['GET', '/api/concentrado-sucursales', 'sucursales:read'],
    ['PUT', '/api/sucursales/3/necesidades', 'sucursales:manage'],
    ['POST', '/api/sucursales/3/necesidades/confirmacion', 'sucursales:manage'],
    ['GET', '/api/inventario-sucursales/captura', 'inventario-sucursales:read'],
    ['GET', '/api/inventario-sucursales/reporte', 'inventario-sucursales:read'],
    ['GET', '/api/inventario-sucursales', 'inventario-sucursales:read'],
    ['PUT', '/api/inventario-sucursales/reportes', 'inventario-sucursales:manage'],
    ['POST', '/api/inventario-sucursales/reportes/4/confirmacion', 'inventario-sucursales:manage'],
    ['GET', '/api/propuestas-abastecimiento', 'abastecimiento:read'],
    ['GET', '/api/propuestas-abastecimiento/4', 'abastecimiento:read'],
    ['POST', '/api/propuestas-abastecimiento', 'abastecimiento:manage'],
    ['PUT', '/api/propuestas-abastecimiento/4/decisiones', 'abastecimiento:manage'],
    ['POST', '/api/propuestas-abastecimiento/4/recalcular', 'abastecimiento:manage'],
    ['POST', '/api/propuestas-abastecimiento/4/confirmacion', 'abastecimiento:manage'],
    ['GET', '/api/abastecimiento-sucursales/resumen', 'abastecimiento:read'],
  ])('maps %s %s to %s', (method, path, permission) => {
    expect(resolveRequiredPermission(method, path)).toBe(permission);
  });

  it('denies unknown routes and permissions absent from the authenticated user', async () => {
    expect(resolveRequiredPermission('DELETE', '/api/unmapped')).toBeUndefined();
    const prisma = { eventoAuditoria: { create: vi.fn().mockResolvedValue({}) } } as unknown as PrismaService;
    const guard = new PermissionsGuard(new Reflector(), prisma);
    await expect(guard.canActivate(context('/api/auth/users', 'GET', ['auth:session']))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(context('/api/auth/users', 'GET', ['usuarios:manage']))).resolves.toBe(true);
    expect(prisma.eventoAuditoria.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accion: 'AUTH_PERMISSION_DENIED', resultado: 'DENIED' }) }));
  });

  it('audits unauthenticated requests without granting access', async () => {
    const prisma = { eventoAuditoria: { create: vi.fn().mockResolvedValue({}) } } as unknown as PrismaService;
    const auth = { authenticate: vi.fn().mockResolvedValue(null) } as unknown as AuthService;
    const guard = new AuthSessionGuard(new Reflector(), auth, prisma);
    await expect(guard.canActivate(context('/api/auth/session', 'GET', []))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.eventoAuditoria.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accion: 'AUTH_SESSION_DENIED', resultado: 'DENIED' }) }));
  });

  it('audits CSRF/Origin rejection before an unsafe route without permitting it', async () => {
    const prisma = { eventoAuditoria: { create: vi.fn().mockResolvedValue({}) } } as unknown as PrismaService;
    const auth = { validateCsrf: vi.fn().mockRejectedValue(new ForbiddenException('Token CSRF inválido')) } as unknown as AuthService;
    const guard = new CsrfGuard(auth, prisma);
    await expect(guard.canActivate(context('/api/clientes', 'POST', []))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.eventoAuditoria.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accion: 'AUTH_CSRF_DENIED', resultado: 'DENIED' }) }));
  });

  it('audits an unmapped route and continues to deny by default', async () => {
    const prisma = { eventoAuditoria: { create: vi.fn().mockResolvedValue({}) } } as unknown as PrismaService;
    const guard = new PermissionsGuard(new Reflector(), prisma);
    await expect(guard.canActivate(context('/api/unmapped', 'GET', ['*']))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.eventoAuditoria.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accion: 'AUTH_PERMISSION_UNMAPPED', requestId: 'request-test' }) }));
  });

  it('fails closed with 503 when a denial cannot be persisted', async () => {
    const prisma = { eventoAuditoria: { create: vi.fn().mockRejectedValue(new Error('database unavailable')) } } as unknown as PrismaService;
    const guard = new PermissionsGuard(new Reflector(), prisma);
    await expect(guard.canActivate(context('/api/auth/users', 'GET', []))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('blocks another Repartidor ID and permits only matching assigned records', async () => {
    const assigned = { id: 7, permissions: ['repartidores:read', 'reparto:operate'], roles: ['REPARTIDOR'], repartidorId: 5 };
    const build = (path: string, method: string, record?: { repartidorId: number; clienteId: number }) => {
      const request = { originalUrl: path, method, authUser: assigned, body: { repartidorId: 6 } };
      const prisma = {
        repartidor: { findUnique: vi.fn().mockResolvedValue({ activo: true }) },
        registroExistencias: { findUnique: vi.fn().mockResolvedValue(record) },
        eventoAuditoria: { create: vi.fn().mockResolvedValue({}) },
      };
      const guard = new RepartidorScopeGuard(prisma as unknown as PrismaService);
      const execution = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
      return { guard, execution, prisma };
    };
    const otherRepartidor = build('/api/repartidores/6', 'GET');
    await expect(otherRepartidor.guard.canActivate(otherRepartidor.execution)).rejects.toBeInstanceOf(ForbiddenException);
    const spoofedVisit = build('/api/clientes/9/visitas', 'POST');
    await expect(spoofedVisit.guard.canActivate(spoofedVisit.execution)).rejects.toBeInstanceOf(ForbiddenException);
    const otherRecord = build('/api/clientes/9/registros-existencias/11', 'GET', { repartidorId: 6, clienteId: 9 });
    await expect(otherRecord.guard.canActivate(otherRecord.execution)).rejects.toBeInstanceOf(ForbiddenException);
    const ownRecord = build('/api/clientes/9/registros-existencias/12', 'GET', { repartidorId: 5, clienteId: 9 });
    await expect(ownRecord.guard.canActivate(ownRecord.execution)).resolves.toBe(true);
  });
});
