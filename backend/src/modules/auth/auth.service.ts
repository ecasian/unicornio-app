import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { OnModuleInit } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../db/prisma.service.js';
import { recordMutationSucceededInTransaction, setAuditActor } from './audit-transaction.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password-hasher.js';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.security.js';

const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const RATE_WINDOW_MINUTES = 15;
const RATE_LIMIT = 10;
const CSRF_RATE_LIMIT = 100;
const ADMIN_ROSTER_LOCK_NAMESPACE = 1398034245;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeHashEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined;
}

function auditRequestId(request: Request): string | undefined {
  return (request as Request & { auditRequestId?: string }).auditRequestId;
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.publicOrigin();
  }

  cookieName(): string {
    return this.publicOrigin().startsWith('https://') ? '__Host-unicornio_session' : 'unicornio_session';
  }

  private csrfCookieName(): string {
    return this.publicOrigin().startsWith('https://') ? '__Host-unicornio_csrf' : 'unicornio_csrf';
  }

  publicOrigin(): string {
    const value = this.config.get<string>('PUBLIC_ORIGIN');
    if (!value) throw new Error('PUBLIC_ORIGIN is required');
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value || url.pathname !== '/') {
      throw new Error('PUBLIC_ORIGIN must be an exact HTTP(S) origin without a path');
    }
    return value;
  }

  private writeCookies(response: Response, token: string, csrfToken: string, clear = false): void {
    const secure = this.publicOrigin().startsWith('https://');
    const sessionParts = [`${this.cookieName()}=${clear ? '' : encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
    const csrfParts = [`${this.csrfCookieName()}=${clear ? '' : encodeURIComponent(csrfToken)}`, 'Path=/', 'SameSite=Lax'];
    if (secure) { sessionParts.push('Secure'); csrfParts.push('Secure'); }
    if (clear) { sessionParts.push('Max-Age=0'); csrfParts.push('Max-Age=0'); }
    else { sessionParts.push(`Max-Age=${Math.floor(SESSION_LIFETIME_MS / 1000)}`); csrfParts.push(`Max-Age=${Math.floor(SESSION_LIFETIME_MS / 1000)}`); }
    response.setHeader('Set-Cookie', [sessionParts.join('; '), csrfParts.join('; ')]);
  }

  private async createSession(userId: number | null, response: Response): Promise<{ sessionId: string; csrfToken: string }> {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const session = await this.prisma.sesion.create({
      data: {
        tokenHash: sha256(token),
        csrfHash: sha256(csrfToken),
        usuarioId: userId,
        expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
      },
      select: { id: true },
    });
    this.writeCookies(response, token, csrfToken);
    return { sessionId: session.id, csrfToken };
  }

  async csrf(request: Request, response: Response): Promise<{ csrfToken: string }> {
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    await this.consumeRateLimit(`csrf-ip\0${ip}`, CSRF_RATE_LIMIT);
    const now = new Date();
    await this.prisma.sesion.deleteMany({ where: { OR: [
      { expiresAt: { lt: now } },
      { revokedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    ] } });
    const token = cookieValue(request, this.cookieName());
    const session = token ? await this.prisma.sesion.findFirst({
      where: { tokenHash: sha256(token), revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, csrfHash: true },
    }) : null;
    const existingCsrf = cookieValue(request, this.csrfCookieName());
    if (session && existingCsrf && safeHashEquals(session.csrfHash, sha256(existingCsrf))) {
      return { csrfToken: existingCsrf };
    }
    if (session) {
      const csrfToken = randomBytes(32).toString('base64url');
      await this.prisma.sesion.update({ where: { id: session.id }, data: { csrfHash: sha256(csrfToken), lastSeenAt: new Date() } });
      this.writeCsrfCookie(response, csrfToken);
      return { csrfToken };
    }
    const created = await this.createSession(null, response);
    return { csrfToken: created.csrfToken };
  }

  private writeCsrfCookie(response: Response, csrfToken: string): void {
    const parts = [`${this.csrfCookieName()}=${encodeURIComponent(csrfToken)}`, 'Path=/', 'SameSite=Lax', `Max-Age=${Math.floor(SESSION_LIFETIME_MS / 1000)}`];
    if (this.publicOrigin().startsWith('https://')) parts.push('Secure');
    const existing = response.getHeader('Set-Cookie');
    const cookies = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
    cookies.push(parts.join('; '));
    response.setHeader('Set-Cookie', cookies);
  }

  async validateCsrf(request: Request): Promise<void> {
    const origin = request.headers.origin;
    if (!origin || origin !== this.publicOrigin()) throw new ForbiddenException('Origen no permitido');
    const cookie = cookieValue(request, this.cookieName());
    const csrfToken = request.headers['x-csrf-token'];
    if (!cookie || typeof csrfToken !== 'string') throw new ForbiddenException('Token CSRF requerido');
    const session = await this.prisma.sesion.findFirst({
      where: { tokenHash: sha256(cookie), revokedAt: null, expiresAt: { gt: new Date() } },
      select: { csrfHash: true },
    });
    if (!session || !safeHashEquals(session.csrfHash, sha256(csrfToken))) throw new ForbiddenException('Token CSRF inválido');
  }

  private async consumeRateLimit(key: string, limit: number): Promise<void> {
    const keyHash = sha256(key);
    const rows = await this.prisma.$queryRaw<Array<{ intentos: number; bloqueadoHasta: Date | null }>>(Prisma.sql`
      INSERT INTO "IntentoAcceso" ("claveHash", "intentos", "ventanaInicio", "bloqueadoHasta", "updatedAt")
      VALUES (${keyHash}, 1, now(), NULL, now())
      ON CONFLICT ("claveHash") DO UPDATE SET
        "intentos" = CASE WHEN "IntentoAcceso"."ventanaInicio" < now() - make_interval(mins => ${RATE_WINDOW_MINUTES}::int) THEN 1 ELSE "IntentoAcceso"."intentos" + 1 END,
        "ventanaInicio" = CASE WHEN "IntentoAcceso"."ventanaInicio" < now() - make_interval(mins => ${RATE_WINDOW_MINUTES}::int) THEN now() ELSE "IntentoAcceso"."ventanaInicio" END,
        "bloqueadoHasta" = CASE
          WHEN "IntentoAcceso"."ventanaInicio" < now() - make_interval(mins => ${RATE_WINDOW_MINUTES}::int) THEN NULL
          WHEN "IntentoAcceso"."bloqueadoHasta" > now() THEN "IntentoAcceso"."bloqueadoHasta"
          WHEN "IntentoAcceso"."intentos" + 1 > ${limit} THEN now() + make_interval(mins => ${RATE_WINDOW_MINUTES}::int)
          ELSE NULL END,
        "updatedAt" = now()
      RETURNING "intentos", "bloqueadoHasta"
    `);
    const result = rows[0];
    if (result && (result.intentos > limit || (result.bloqueadoHasta && result.bloqueadoHasta > new Date()))) {
      throw new HttpException('Demasiados intentos. Intenta más tarde.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async consumeLoginAttempt(email: string, ip: string): Promise<void> {
    await this.prisma.intentoAcceso.deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
    await this.consumeRateLimit(`ip\0${ip}`, 100);
    await this.consumeRateLimit(`email-ip\0${email}\0${ip}`, RATE_LIMIT);
  }

  private async publicUser(userId: number, database: Pick<Prisma.TransactionClient, 'usuarioInterno'> = this.prisma): Promise<AuthenticatedUser> {
    const user = await database.usuarioInterno.findUnique({
      where: { id: userId },
      include: { roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } } },
    });
    if (!user || !user.activo) throw new UnauthorizedException('Sesión no válida');
    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      repartidorId: user.repartidorId,
      roles: user.roles.map(({ rol }) => rol.codigo),
      permissions: [...new Set(user.roles.flatMap(({ rol }) => rol.permisos.map(({ permiso }) => permiso.codigo)))],
    };
  }

  private async lockAdminRoster(transaction: Prisma.TransactionClient): Promise<void> {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_ROSTER_LOCK_NAMESPACE}::integer, 1::integer)`;
  }

  async login(emailInput: string, password: string, request: Request, response: Response): Promise<{ user: AuthenticatedUser }> {
    const email = emailInput.trim().toLowerCase();
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    await this.consumeLoginAttempt(email, ip);
    const user = await this.prisma.usuarioInterno.findUnique({ where: { email } });
    const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : (await burnPasswordCheck(password), false);
    if (!user || !user.activo || !passwordMatches) {
      await this.prisma.eventoAuditoria.create({ data: { accion: 'AUTH_LOGIN_FAILED', ruta: '/api/auth/login', metodo: 'POST', resultado: 'DENIED', requestId: auditRequestId(request) } });
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    setAuditActor(user.id);
    const currentToken = cookieValue(request, this.cookieName());
    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    try {
      const authenticatedUser = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "UsuarioInterno" WHERE id = ${user.id} FOR UPDATE`;
        const currentUser = await tx.usuarioInterno.findUnique({ where: { id: user.id }, select: { passwordHash: true, activo: true } });
        if (!currentUser?.activo || currentUser.passwordHash !== user.passwordHash) throw new UnauthorizedException('Correo o contraseña incorrectos');
        if (currentToken) await tx.sesion.updateMany({ where: { tokenHash: sha256(currentToken), revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.intentoAcceso.deleteMany({ where: { claveHash: sha256(`email-ip\0${email}\0${ip}`) } });
        await tx.sesion.create({ data: {
          tokenHash: sha256(sessionToken), csrfHash: sha256(csrfToken), usuarioId: user.id,
          expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
        } });
        await tx.eventoAuditoria.create({ data: { actorUsuarioId: user.id, accion: 'AUTH_LOGIN', ruta: '/api/auth/login', metodo: 'POST', resultado: 'SUCCESS', requestId: auditRequestId(request) } });
        const result = await this.publicUser(user.id, tx);
        await recordMutationSucceededInTransaction(tx);
        return result;
      });
      this.writeCookies(response, sessionToken, csrfToken);
      response.setHeader('X-CSRF-Token', csrfToken);
      return { user: authenticatedUser };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.prisma.eventoAuditoria.create({ data: { accion: 'AUTH_LOGIN_FAILED', ruta: '/api/auth/login', metodo: 'POST', resultado: 'DENIED', requestId: auditRequestId(request) } });
      }
      throw error;
    }
  }

  async current(request: AuthenticatedRequest): Promise<AuthenticatedUser> {
    if (!request.authUser) throw new UnauthorizedException('Sesión no válida');
    return request.authUser;
  }

  async authenticate(request: Request): Promise<{ user: AuthenticatedUser; sessionId: string } | null> {
    const token = cookieValue(request, this.cookieName());
    if (!token) return null;
    const session = await this.prisma.sesion.findFirst({
      where: { tokenHash: sha256(token), usuarioId: { not: null }, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, usuarioId: true },
    });
    if (!session?.usuarioId) return null;
    return { user: await this.publicUser(session.usuarioId), sessionId: session.id };
  }

  async logout(request: AuthenticatedRequest, response: Response): Promise<{ ok: true }> {
    const cookie = cookieValue(request, this.cookieName());
    await this.prisma.$transaction(async (tx) => {
      if (cookie) await tx.sesion.updateMany({ where: { tokenHash: sha256(cookie), revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.eventoAuditoria.create({ data: { actorUsuarioId: request.authUser?.id, accion: 'AUTH_LOGOUT', ruta: '/api/auth/logout', metodo: 'POST', resultado: 'SUCCESS', requestId: request.auditRequestId } });
      await recordMutationSucceededInTransaction(tx);
    });
    this.writeCookies(response, '', '', true);
    return { ok: true };
  }

  async listUsers() {
    return this.prisma.usuarioInterno.findMany({
      select: { id: true, nombre: true, email: true, activo: true, repartidorId: true, createdAt: true, updatedAt: true, roles: { select: { rol: { select: { codigo: true, nombre: true } } } } },
      orderBy: { id: 'asc' },
    });
  }

  async listRoles() {
    return this.prisma.rol.findMany({ include: { permisos: { include: { permiso: true } } }, orderBy: { codigo: 'asc' } });
  }

  async createUser(data: { nombre: string; email: string; password: string; roles: string[]; repartidorId?: number }, actorId: number, requestId?: string) {
    const passwordHash = await hashPassword(data.password);
    return this.prisma.$transaction(async (tx) => {
      await this.lockAdminRoster(tx);
      const roles = await tx.rol.findMany({ where: { codigo: { in: data.roles } } });
      if (roles.length !== new Set(data.roles).size) throw new BadRequestException('Rol no reconocido');
      if (data.roles.includes('REPARTIDOR')) {
        if (!data.repartidorId) throw new BadRequestException('El rol Repartidor requiere una asignación');
        const assigned = await tx.repartidor.findUnique({ where: { id: data.repartidorId } });
        if (!assigned?.activo) throw new BadRequestException('El Repartidor asignado no existe o está inactivo');
      } else if (data.repartidorId !== undefined) {
        throw new BadRequestException('La asignación de Repartidor solo aplica al rol Repartidor');
      }
      const user = await tx.usuarioInterno.create({
        data: {
          nombre: data.nombre.trim(),
          email: data.email.trim().toLowerCase(),
          passwordHash,
          repartidorId: data.repartidorId,
          roles: { create: roles.map(({ id }) => ({ rolId: id })) },
        },
        select: { id: true, nombre: true, email: true, activo: true, repartidorId: true },
      });
      await tx.eventoAuditoria.create({ data: { actorUsuarioId: actorId, accion: 'USER_CREATED', ruta: '/api/auth/users', metodo: 'POST', resultado: 'SUCCESS', requestId, metadata: { userId: user.id, roleCodes: data.roles } } });
      await recordMutationSucceededInTransaction(tx);
      return user;
    });
  }

  async setUserActive(id: number, activo: boolean, actorId: number, requestId?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAdminRoster(tx);
      const target = await tx.usuarioInterno.findUnique({ where: { id }, include: { roles: { include: { rol: true } } } });
      if (!target) throw new NotFoundException('Usuario no encontrado');
      if (!activo && target.activo && target.roles.some(({ rol }) => rol.codigo === 'ADMIN_GENERAL')) {
        const adminCount = await tx.usuarioInterno.count({ where: { activo: true, roles: { some: { rol: { codigo: 'ADMIN_GENERAL' } } } } });
        if (adminCount <= 1) throw new ConflictException('No se puede desactivar al último administrador general');
      }
      const user = await tx.usuarioInterno.update({ where: { id }, data: { activo } });
      if (!activo) await tx.sesion.updateMany({ where: { usuarioId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.eventoAuditoria.create({ data: { actorUsuarioId: actorId, accion: 'USER_ACTIVE_CHANGED', ruta: `/api/auth/users/${id}/active`, metodo: 'PATCH', resultado: 'SUCCESS', requestId, metadata: { userId: id, activo } } });
      await recordMutationSucceededInTransaction(tx);
      return { id: user.id, activo: user.activo };
    });
  }

  async setUserRoles(id: number, roleCodes: string[], actorId: number, requestId?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAdminRoster(tx);
      const roles = await tx.rol.findMany({ where: { codigo: { in: roleCodes } } });
      if (roles.length !== new Set(roleCodes).size) throw new BadRequestException('Rol no reconocido');
      const target = await tx.usuarioInterno.findUnique({ where: { id }, include: { roles: { include: { rol: true } } } });
      if (!target) throw new NotFoundException('Usuario no encontrado');
      if (roleCodes.includes('REPARTIDOR') && !target.repartidorId) throw new BadRequestException('El rol Repartidor requiere una asignación');
      if (roleCodes.includes('REPARTIDOR')) {
        const assigned = await tx.repartidor.findUnique({ where: { id: target.repartidorId! } });
        if (!assigned?.activo) throw new BadRequestException('El Repartidor asignado no existe o está inactivo');
      }
      const wasAdmin = target.roles.some(({ rol }) => rol.codigo === 'ADMIN_GENERAL');
      if (wasAdmin && !roleCodes.includes('ADMIN_GENERAL')) {
        const adminCount = await tx.usuarioInterno.count({ where: { activo: true, roles: { some: { rol: { codigo: 'ADMIN_GENERAL' } } } } });
        if (target.activo && adminCount <= 1) throw new ConflictException('No se puede quitar el último administrador general');
      }
      await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
      await tx.usuarioRol.createMany({ data: roles.map(({ id: rolId }) => ({ usuarioId: id, rolId })) });
      await tx.sesion.updateMany({ where: { usuarioId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.eventoAuditoria.create({ data: { actorUsuarioId: actorId, accion: 'USER_ROLES_CHANGED', ruta: `/api/auth/users/${id}/roles`, metodo: 'PUT', resultado: 'SUCCESS', requestId, metadata: { userId: id, roleCodes } } });
      await recordMutationSucceededInTransaction(tx);
      return { id, roles: roleCodes };
    });
  }

  async resetPassword(id: number, password: string, actorId: number, requestId?: string) {
    const passwordHash = await hashPassword(password);
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.usuarioInterno.findUnique({ where: { id }, select: { id: true } });
      if (!target) throw new NotFoundException('Usuario no encontrado');
      await tx.usuarioInterno.update({ where: { id }, data: { passwordHash } });
      await tx.sesion.updateMany({ where: { usuarioId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.eventoAuditoria.create({ data: { actorUsuarioId: actorId, accion: 'USER_PASSWORD_RESET', ruta: `/api/auth/users/${id}/password`, metodo: 'PATCH', resultado: 'SUCCESS', requestId, metadata: { userId: id } } });
      await recordMutationSucceededInTransaction(tx);
      return { id, passwordUpdated: true };
    });
  }

  async listAudit(take = 100) {
    const events = await this.prisma.eventoAuditoria.findMany({
      take: Math.min(Math.max(take, 1), 500),
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, nombre: true, email: true } } },
    });
    return events.map((event) => ({ ...event, id: event.id.toString() }));
  }
}
