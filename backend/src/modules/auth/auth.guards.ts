import { CanActivate, ExecutionContext, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../db/prisma.service.js';
import { AuthService } from './auth.service.js';
import { PUBLIC_ROUTE, REQUIRED_PERMISSION } from './auth.security.js';
import type { AuthenticatedRequest } from './auth.security.js';
import { setAuditActor } from './audit-transaction.js';

async function auditGuardDenial(prisma: PrismaService, request: AuthenticatedRequest, action: string, phase: string): Promise<void> {
  try {
    await prisma.eventoAuditoria.create({ data: {
      actorUsuarioId: request.authUser?.id,
      accion: action,
      ruta: new URL(request.originalUrl, 'http://local').pathname,
      metodo: request.method.toUpperCase(),
      resultado: 'DENIED',
      requestId: request.auditRequestId,
      metadata: { phase },
    } });
  } catch {
    throw new ServiceUnavailableException('No se pudo registrar la denegación de acceso. Conserva el requestId para revisión.');
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return true;
    try {
      await this.auth.validateCsrf(request);
    } catch (error) {
      await auditGuardDenial(this.prisma, request as AuthenticatedRequest, 'AUTH_CSRF_DENIED', 'csrf');
      throw error;
    }
    return true;
  }
}

@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService, private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    let authenticated: Awaited<ReturnType<AuthService['authenticate']>>;
    try {
      authenticated = await this.auth.authenticate(request);
    } catch (error) {
      if (error instanceof UnauthorizedException) await auditGuardDenial(this.prisma, request, 'AUTH_SESSION_DENIED', 'session');
      throw error;
    }
    if (!authenticated) {
      await auditGuardDenial(this.prisma, request, 'AUTH_SESSION_DENIED', 'session');
      throw new UnauthorizedException('Inicia sesión para continuar');
    }
    request.authUser = authenticated.user;
    request.sessionId = authenticated.sessionId;
    setAuditActor(authenticated.user.id);
    return true;
  }
}

type PermissionRule = { method: string; path: RegExp; permission: string };
const rules: PermissionRule[] = [
  { method: 'GET', path: /^\/api\/auth\/session$/, permission: 'auth:session' },
  { method: 'POST', path: /^\/api\/auth\/logout$/, permission: 'auth:session' },
  { method: 'GET', path: /^\/api\/auth\/(users|roles)$/, permission: 'usuarios:manage' },
  { method: 'POST', path: /^\/api\/auth\/users$/, permission: 'usuarios:manage' },
  { method: 'PATCH', path: /^\/api\/auth\/users\/\d+\/active$/, permission: 'usuarios:manage' },
  { method: 'PATCH', path: /^\/api\/auth\/users\/\d+\/password$/, permission: 'usuarios:manage' },
  { method: 'PUT', path: /^\/api\/auth\/users\/\d+\/roles$/, permission: 'usuarios:manage' },
  { method: 'GET', path: /^\/api\/auth\/audit$/, permission: 'auditoria:read' },
  { method: 'GET', path: /^\/api\/clientes\/\d+\/stock-objetivo$/, permission: 'stock-cliente:read' },
  { method: 'PUT', path: /^\/api\/clientes\/\d+\/stock-objetivo$/, permission: 'stock-cliente:manage' },
  { method: 'GET', path: /^\/api\/clientes\/\d+\/surtido-operativo$/, permission: 'reparto:operate' },
  { method: 'GET', path: /^\/api\/clientes\/\d+\/(registros-existencias|stock-objetivo|surtido-operativo)(\/.*)?$/, permission: 'reparto:operate' },
  { method: 'POST', path: /^\/api\/clientes\/\d+\/(visitas|registros-existencias)(\/.*)?$/, permission: 'reparto:operate' },
  { method: 'GET', path: /^\/api\/clientes(\/\d+)?$/, permission: 'clientes:read' },
  { method: 'POST', path: /^\/api\/clientes$/, permission: 'clientes:manage' },
  { method: 'PATCH', path: /^\/api\/clientes\/\d+$/, permission: 'clientes:manage' },
  { method: 'GET', path: /^\/api\/(sabores|presentaciones)(\/.*)?$/, permission: 'catalogo:read' },
  { method: 'POST', path: /^\/api\/sabores$/, permission: 'catalogo:manage' },
  { method: 'PATCH', path: /^\/api\/sabores\/\d+$/, permission: 'catalogo:manage' },
  { method: 'PUT', path: /^\/api\/sabores\/\d+\/presentaciones$/, permission: 'catalogo:manage' },
  { method: 'GET', path: /^\/api\/repartidores(\/\d+)?$/, permission: 'repartidores:read' },
  { method: 'POST', path: /^\/api\/repartidores$/, permission: 'repartidores:manage' },
  { method: 'PATCH', path: /^\/api\/repartidores\/\d+$/, permission: 'repartidores:manage' },
  { method: 'GET', path: /^\/api\/produccion$/, permission: 'produccion:read' },
  { method: 'GET', path: /^\/api\/yogurt-base$/, permission: 'produccion:read' },
  { method: 'POST', path: /^\/api\/yogurt-base\/(lotes|acondicionamientos)$/, permission: 'produccion:manage' },
  { method: 'GET', path: /^\/api\/admin\/visitas$/, permission: 'visitas:read' },
  { method: 'GET', path: /^\/api\/(sucursales|sucursales\/sabores|concentrado-sucursales)(\/.*)?$/, permission: 'sucursales:read' },
  { method: 'GET', path: /^\/api\/sucursales\/\d+\/stock-objetivo(\/.*)?$/, permission: 'sucursales:read' },
  { method: 'POST', path: /^\/api\/sucursales$/, permission: 'sucursales:manage' },
  { method: 'PATCH', path: /^\/api\/sucursales\/\d+$/, permission: 'sucursales:manage' },
  { method: 'PUT', path: /^\/api\/sucursales\/\d+\/(necesidades|stock-objetivo)(\/.*)?$/, permission: 'sucursales:manage' },
  { method: 'POST', path: /^\/api\/sucursales\/\d+\/necesidades\/confirmacion$/, permission: 'sucursales:manage' },
  { method: 'GET', path: /^\/api\/inventario-sucursales(\/.*)?$/, permission: 'inventario-sucursales:read' },
  { method: 'PUT', path: /^\/api\/inventario-sucursales\/reportes$/, permission: 'inventario-sucursales:manage' },
  { method: 'POST', path: /^\/api\/inventario-sucursales\/reportes\/\d+\/confirmacion$/, permission: 'inventario-sucursales:manage' },
  { method: 'GET', path: /^\/api\/propuestas-abastecimiento(\/.*)?$/, permission: 'abastecimiento:read' },
  { method: 'POST', path: /^\/api\/propuestas-abastecimiento$/, permission: 'abastecimiento:manage' },
  { method: 'POST', path: /^\/api\/propuestas-abastecimiento\/\d+\/(recalcular|confirmacion)$/, permission: 'abastecimiento:manage' },
  { method: 'PUT', path: /^\/api\/propuestas-abastecimiento\/\d+\/decisiones$/, permission: 'abastecimiento:manage' },
  { method: 'GET', path: /^\/api\/abastecimiento-sucursales\/resumen$/, permission: 'abastecimiento:read' },
];

export function resolveRequiredPermission(method: string, pathname: string): string | undefined {
  return rules.find((candidate) => candidate.method === method.toUpperCase() && candidate.path.test(pathname))?.permission;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const explicit = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION, [context.getHandler(), context.getClass()]);
    const url = new URL(request.originalUrl, 'http://local').pathname;
    const required = explicit ?? resolveRequiredPermission(request.method, url);
    if (!required) {
      await auditGuardDenial(this.prisma, request, 'AUTH_PERMISSION_UNMAPPED', 'permission');
      throw new ForbiddenException('Ruta sin permiso configurado');
    }
    if (!request.authUser?.permissions.includes(required)) {
      await auditGuardDenial(this.prisma, request, 'AUTH_PERMISSION_DENIED', 'permission');
      throw new ForbiddenException('No tienes permiso para esta operación');
    }
    return true;
  }
}

@Injectable()
export class RepartidorScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.authUser;
    if (!user?.roles.includes('REPARTIDOR') || user.roles.includes('ADMIN_GENERAL')) return true;
    const assignedId = user.repartidorId;
    if (!assignedId) {
      await auditGuardDenial(this.prisma, request, 'AUTH_SCOPE_DENIED', 'repartidor');
      throw new ForbiddenException('La cuenta no tiene un repartidor asignado');
    }
    const assigned = await this.prisma.repartidor.findUnique({ where: { id: assignedId }, select: { activo: true } });
    if (!assigned?.activo) {
      await auditGuardDenial(this.prisma, request, 'AUTH_SCOPE_DENIED', 'repartidor');
      throw new ForbiddenException('El Repartidor asignado está inactivo');
    }
    const method = request.method.toUpperCase();
    const path = new URL(request.originalUrl, 'http://local').pathname;
    if (path === '/api/repartidores' && method === 'GET') {
      (request as AuthenticatedRequest & { assignedRepartidorId?: number }).assignedRepartidorId = assignedId;
      return true;
    }
    const repartidorMatch = path.match(/^\/api\/repartidores\/(\d+)$/);
    if (repartidorMatch && Number(repartidorMatch[1]) !== assignedId) {
      await auditGuardDenial(this.prisma, request, 'AUTH_SCOPE_DENIED', 'repartidor');
      throw new ForbiddenException('Solo puedes consultar el repartidor asignado a tu cuenta');
    }
    if (method === 'POST' && /\/api\/clientes\/\d+\/visitas$/.test(path)) {
      if (Number((request.body as { repartidorId?: number }).repartidorId) !== assignedId) {
        await auditGuardDenial(this.prisma, request, 'AUTH_SCOPE_DENIED', 'repartidor');
        throw new ForbiddenException('El repartidor no corresponde a tu cuenta');
      }
    }
    if (method === 'POST' && /\/api\/clientes\/\d+\/registros-existencias$/.test(path)) {
      if (Number((request.body as { repartidorId?: number }).repartidorId) !== assignedId) {
        await auditGuardDenial(this.prisma, request, 'AUTH_SCOPE_DENIED', 'repartidor');
        throw new ForbiddenException('El repartidor no corresponde a tu cuenta');
      }
    }
    const registroMatch = path.match(/^\/api\/clientes\/(\d+)\/registros-existencias\/(\d+)(?:\/correcciones)?$/);
    if (registroMatch && (method === 'GET' || method === 'POST')) {
      const registro = await this.prisma.registroExistencias.findUnique({ where: { id: Number(registroMatch[2]) }, select: { repartidorId: true, clienteId: true } });
      if (!registro || registro.clienteId !== Number(registroMatch[1]) || registro.repartidorId !== assignedId) {
        await auditGuardDenial(this.prisma, request, 'AUTH_SCOPE_DENIED', 'repartidor');
        throw new ForbiddenException('El registro no pertenece al repartidor asignado');
      }
    }
    return true;
  }
}
