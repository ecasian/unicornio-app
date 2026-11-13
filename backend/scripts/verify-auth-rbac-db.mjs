import { createHash, randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../dist/modules/auth/password-hasher.js';
import { recordMutationSucceededInTransaction, runWithAuditRequestContext } from '../dist/modules/auth/audit-transaction.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.includes('auth_rbac_audit_test')) {
  throw new Error('DATABASE_URL debe apuntar a la base aislada auth_rbac_audit_test.');
}

const prisma = new PrismaClient();
const suffix = randomUUID();
const email = `auth-verify-${suffix}@example.invalid`;
const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
const temporaryAdminIds = [];

try {
  const [{ current_database: database }] = await prisma.$queryRaw`SELECT current_database()`;
  if (database !== 'auth_rbac_audit_test') throw new Error(`Base inesperada: ${database}`);

  const roles = await prisma.rol.findMany({ include: { permisos: true } });
  const roleCodes = new Set(roles.map((role) => role.codigo));
  for (const code of ['ADMIN_GENERAL', 'ADMIN_SUCURSALES', 'REPARTIDOR', 'OPERADOR_PRODUCCION']) {
    if (!roleCodes.has(code)) throw new Error(`Falta rol ${code}`);
  }
  const admin = roles.find((role) => role.codigo === 'ADMIN_GENERAL');
  const permissions = await prisma.permiso.count();
  if (!admin || admin.permisos.length !== permissions) throw new Error('ADMIN_GENERAL no tiene la matriz completa de permisos.');
  const actor = await prisma.usuarioInterno.findFirst({
    where: { activo: true, roles: { some: { rol: { codigo: 'ADMIN_GENERAL' } } } },
    select: { id: true },
  });
  if (!actor) throw new Error('Se requiere un ADMIN_GENERAL DEMO activo para verificar el actor auditado.');

  const existingAdmins = await prisma.usuarioInterno.count({ where: { activo: true, roles: { some: { rol: { codigo: 'ADMIN_GENERAL' } } } } });
  if (existingAdmins === 0) {
    const bootstrapCandidates = await Promise.all([1, 2].map((index) => prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1398034245::integer, 1::integer)`;
      const activeAdmins = await tx.usuarioInterno.count({ where: { activo: true, roles: { some: { rol: { codigo: 'ADMIN_GENERAL' } } } } });
      if (activeAdmins > 0) return null;
      const candidate = await tx.usuarioInterno.create({ data: {
        nombre: `Bootstrap Race ${index}`,
        email: `bootstrap-race-${index}-${suffix}@example.invalid`,
        passwordHash: 'not-used-in-verification',
        roles: { create: { rolId: admin.id } },
      }, select: { id: true } });
      temporaryAdminIds.push(candidate.id);
      return candidate.id;
    })));
    if (bootstrapCandidates.filter(Boolean).length !== 1) throw new Error('El lock transaccional no serializó la creación del primer administrador.');
    if (await prisma.usuarioInterno.count({ where: { activo: true, roles: { some: { rol: { codigo: 'ADMIN_GENERAL' } } } } }) !== 1) {
      throw new Error('La carrera de bootstrap produjo un número inesperado de administradores.');
    }
    await prisma.$transaction(async (tx) => {
      await tx.usuarioRol.deleteMany({ where: { usuarioId: { in: temporaryAdminIds } } });
      await tx.usuarioInterno.deleteMany({ where: { id: { in: temporaryAdminIds } } });
    });
    temporaryAdminIds.length = 0;
  } else {
    process.stdout.write('SKIP: carrera de bootstrap; se conserva el administrador DEMO activo existente.\n');
  }

  const verificationPassword = randomBytes(24).toString('base64url');
  const incorrectPassword = randomBytes(24).toString('base64url');
  const passwordHash = await hashPassword(verificationPassword);
  if (!passwordHash.startsWith('$argon2id$') || !await verifyPassword(verificationPassword, passwordHash) || await verifyPassword(incorrectPassword, passwordHash)) {
    throw new Error('Argon2id no pasó verificación positiva/negativa.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.usuarioInterno.create({ data: { nombre: 'Rollback Auth Test', email: `rollback-${suffix}@example.invalid`, passwordHash } });
    await tx.eventoAuditoria.create({ data: { accion: 'AUTH_DB_ROLLBACK_PROBE', ruta: 'db-verifier', metodo: 'TEST', resultado: 'SUCCESS', requestId: `rollback-${suffix}` } });
    throw new Error('rollback probe');
  }).catch((error) => {
    if (error.message !== 'rollback probe') throw error;
  });
  if (await prisma.usuarioInterno.findUnique({ where: { email: `rollback-${suffix}@example.invalid` } })) throw new Error('La transacción de rollback dejó un usuario persistido.');
  if (await prisma.eventoAuditoria.findFirst({ where: { requestId: `rollback-${suffix}` } })) throw new Error('El rollback dejó evidencia terminal de una operación no confirmada.');

  const terminalRequestId = `terminal-${suffix}`;
  await prisma.eventoAuditoria.create({ data: { accion: 'MUTATION_REQUESTED', ruta: 'db-verifier', metodo: 'TEST', resultado: 'REQUESTED', requestId: terminalRequestId } });
  const insertTerminal = (accion, resultado) => prisma.$executeRaw`
    INSERT INTO "EventoAuditoria" ("accion", "ruta", "metodo", "resultado", "requestId", "metadata")
    VALUES (${accion}, 'db-verifier', 'TEST', ${resultado}, ${terminalRequestId}, '{}'::jsonb)
    ON CONFLICT ("requestId") WHERE "requestId" IS NOT NULL AND "accion" IN ('MUTATION_SUCCEEDED', 'MUTATION_FAILED')
    DO NOTHING
  `;
  if (await insertTerminal('MUTATION_SUCCEEDED', 'SUCCESS') !== 1) throw new Error('No se insertó el primer resultado terminal.');
  if (await insertTerminal('MUTATION_SUCCEEDED', 'SUCCESS') !== 0) throw new Error('El reintento terminal no fue idempotente.');
  if (await insertTerminal('MUTATION_FAILED', 'FAILED') !== 0) throw new Error('Se aceptaron dos resultados terminales para el requestId.');
  const terminalEvents = await prisma.eventoAuditoria.findMany({ where: { requestId: terminalRequestId, accion: { in: ['MUTATION_SUCCEEDED', 'MUTATION_FAILED'] } } });
  if (terminalEvents.length !== 1 || terminalEvents[0].accion !== 'MUTATION_SUCCEEDED') throw new Error('La restricción terminal no preservó un solo resultado.');

  const retryRequestId = `audit-retry-${suffix}`;
  await prisma.eventoAuditoria.create({ data: { accion: 'MUTATION_REQUESTED', ruta: 'db-verifier', metodo: 'TEST', resultado: 'REQUESTED', requestId: retryRequestId } });
  let terminalWriteFailed = false;
  try {
    await prisma.$executeRaw`
      INSERT INTO "EventoAuditoria" ("actorUsuarioId", "accion", "ruta", "metodo", "resultado", "requestId", "metadata")
      VALUES (2147483647, 'MUTATION_FAILED', 'db-verifier', 'TEST', 'FAILED', ${retryRequestId}, '{}'::jsonb)
      ON CONFLICT ("requestId") WHERE "requestId" IS NOT NULL AND "accion" IN ('MUTATION_SUCCEEDED', 'MUTATION_FAILED')
      DO NOTHING
    `;
  } catch {
    terminalWriteFailed = true;
  }
  if (!terminalWriteFailed) throw new Error('La prueba esperaba que la FK rechazara la escritura terminal inválida.');
  if (await prisma.eventoAuditoria.count({ where: { requestId: retryRequestId, accion: { in: ['MUTATION_SUCCEEDED', 'MUTATION_FAILED'] } } }) !== 0) {
    throw new Error('La escritura terminal rechazada dejó evidencia parcial.');
  }
  if (await prisma.$executeRaw`
    INSERT INTO "EventoAuditoria" ("accion", "ruta", "metodo", "resultado", "requestId", "metadata")
    VALUES ('MUTATION_FAILED', 'db-verifier', 'TEST', 'FAILED', ${retryRequestId}, '{}'::jsonb)
    ON CONFLICT ("requestId") WHERE "requestId" IS NOT NULL AND "accion" IN ('MUTATION_SUCCEEDED', 'MUTATION_FAILED')
    DO NOTHING
  ` !== 1) throw new Error('El reintento no resolvió el evento pendiente.');
  if (await prisma.eventoAuditoria.count({ where: { requestId: retryRequestId, accion: { in: ['MUTATION_SUCCEEDED', 'MUTATION_FAILED'] } } }) !== 1) {
    throw new Error('El reintento produjo un número inesperado de eventos terminales.');
  }

  // Modela una operación transaccional: si SUCCEEDED no puede escribirse,
  // la mutación de negocio también debe revertirse.
  const successRollbackRequestId = `success-rollback-${suffix}`;
  const successRollbackKey = `audit-success-rollback-${suffix}`;
  await prisma.eventoAuditoria.create({ data: {
    actorUsuarioId: actor.id, accion: 'MUTATION_REQUESTED', ruta: '/api/test/transaction',
    metodo: 'POST', resultado: 'REQUESTED', requestId: successRollbackRequestId,
  } });
  let successTerminalWriteFailed = false;
  try {
    await runWithAuditRequestContext({
      requestId: successRollbackRequestId, route: '/api/test/transaction', method: 'POST', actorUserId: 2147483647,
    }, () => prisma.$transaction(async (tx) => {
      await tx.intentoAcceso.create({ data: { claveHash: successRollbackKey } });
      await recordMutationSucceededInTransaction(tx);
    }));
  } catch {
    successTerminalWriteFailed = true;
  }
  if (!successTerminalWriteFailed) throw new Error('La FK debía rechazar SUCCEEDED y revertir la mutación de prueba.');
  if (await prisma.intentoAcceso.findUnique({ where: { claveHash: successRollbackKey } })) {
    throw new Error('La mutación de negocio persistió pese al fallo de SUCCEEDED.');
  }
  if (await prisma.eventoAuditoria.count({ where: { requestId: successRollbackRequestId, accion: { in: ['MUTATION_SUCCEEDED', 'MUTATION_FAILED'] } } }) !== 0) {
    throw new Error('El rollback de SUCCEEDED dejó un evento terminal parcial.');
  }
  await prisma.eventoAuditoria.create({ data: {
    actorUsuarioId: actor.id, accion: 'MUTATION_FAILED', ruta: '/api/test/transaction',
    metodo: 'POST', resultado: 'FAILED', requestId: successRollbackRequestId,
    metadata: { httpStatus: 503, businessTransactionRolledBack: true },
  } });
  const rolledBackTerminal = await prisma.eventoAuditoria.findMany({
    where: { requestId: successRollbackRequestId, accion: { in: ['MUTATION_SUCCEEDED', 'MUTATION_FAILED'] } },
  });
  if (rolledBackTerminal.length !== 1 || rolledBackTerminal[0].accion !== 'MUTATION_FAILED') {
    throw new Error('El resultado fallido posterior al rollback no quedó como terminal único.');
  }

  // Un éxito confirma negocio y auditoría juntos; la finalización genérica
  // posterior debe reconocer ese terminal sin duplicarlo.
  const successRequestId = `success-commit-${suffix}`;
  const successKey = `audit-success-commit-${suffix}`;
  await prisma.eventoAuditoria.create({ data: {
    actorUsuarioId: actor.id, accion: 'MUTATION_REQUESTED', ruta: '/api/test/transaction',
    metodo: 'POST', resultado: 'REQUESTED', requestId: successRequestId,
  } });
  await runWithAuditRequestContext({
    requestId: successRequestId, route: '/api/test/transaction', method: 'POST', actorUserId: actor.id,
  }, () => prisma.$transaction(async (tx) => {
    await tx.intentoAcceso.create({ data: { claveHash: successKey } });
    await recordMutationSucceededInTransaction(tx);
  }));
  const committedSuccess = await prisma.eventoAuditoria.findMany({
    where: { requestId: successRequestId, accion: { in: ['MUTATION_SUCCEEDED', 'MUTATION_FAILED'] } },
  });
  if (!await prisma.intentoAcceso.findUnique({ where: { claveHash: successKey } }) || committedSuccess.length !== 1 ||
      committedSuccess[0].accion !== 'MUTATION_SUCCEEDED' || committedSuccess[0].actorUsuarioId !== actor.id) {
    throw new Error('La mutación exitosa y su único terminal con actor no se confirmaron juntos.');
  }
  // Estos dos son fixtures técnicos de esta verificación; los eventos de auditoría
  // son append-only y quedan conservados.
  await prisma.intentoAcceso.deleteMany({ where: { claveHash: { in: [successRollbackKey, successKey] } } });

  const user = await prisma.usuarioInterno.create({ data: {
    nombre: 'Auth DB Verification', email, passwordHash,
    roles: { create: { rolId: admin.id } },
  } });
  const sessions = await Promise.all(Array.from({ length: 8 }, (_, index) => prisma.sesion.create({ data: {
    tokenHash: tokenHash(`${suffix}-${index}`), csrfHash: tokenHash(`csrf-${suffix}-${index}`),
    usuarioId: user.id, expiresAt: new Date(Date.now() + 60_000),
  } })));
  if (new Set(sessions.map(({ id }) => id)).size !== 8) throw new Error('Sesiones concurrentes no obtuvieron IDs independientes.');
  await prisma.sesion.updateMany({ where: { usuarioId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (await prisma.sesion.count({ where: { usuarioId: user.id, revokedAt: null } })) throw new Error('La revocación de sesiones quedó incompleta.');

  const audit = await prisma.eventoAuditoria.create({ data: {
    accion: 'AUTH_DB_VERIFICATION', ruta: 'db-verifier', metodo: 'TEST', resultado: 'PASS', metadata: { verificationId: suffix },
  } });
  let appendOnlyBlocked = false;
  try { await prisma.eventoAuditoria.update({ where: { id: audit.id }, data: { resultado: 'CHANGED' } }); }
  catch { appendOnlyBlocked = true; }
  if (!appendOnlyBlocked) throw new Error('La tabla de auditoría permitió modificar un evento.');
  let truncateBlocked = false;
  try { await prisma.$executeRawUnsafe('TRUNCATE TABLE "EventoAuditoria"'); }
  catch (error) {
    const message = `${error.message ?? ''} ${error.meta?.message ?? ''}`;
    truncateBlocked = message.includes('append-only');
  }
  if (!truncateBlocked) throw new Error('La tabla de auditoría permitió truncar el historial.');

  await prisma.$transaction(async (tx) => {
    await tx.sesion.deleteMany({ where: { usuarioId: user.id } });
    await tx.usuarioRol.deleteMany({ where: { usuarioId: user.id } });
    await tx.usuarioInterno.delete({ where: { id: user.id } });
  });
  process.stdout.write(`PASS: PostgreSQL ${database}; roles/permisos, Argon2id, rollback negocio/SUCCEEDED, terminal único con actor, sesiones/revocación y auditoría append-only (UPDATE/DELETE/TRUNCATE).\n`);
} finally {
  if (temporaryAdminIds.length) {
    await prisma.usuarioRol.deleteMany({ where: { usuarioId: { in: temporaryAdminIds } } });
    await prisma.usuarioInterno.deleteMany({ where: { id: { in: temporaryAdminIds } } });
  }
  await prisma.$disconnect();
}
