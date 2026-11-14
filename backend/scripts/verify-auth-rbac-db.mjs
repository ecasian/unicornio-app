import { createHash, randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../dist/modules/auth/password-hasher.js';
import { recordMutationSucceededInTransaction, runWithAuditRequestContext } from '../dist/modules/auth/audit-transaction.js';
import { ClientesService } from '../dist/modules/clientes/clientes.service.js';
import { CatalogoService } from '../dist/modules/catalogo/catalogo.service.js';
import { RepartidoresService } from '../dist/modules/repartidores/repartidores.service.js';
import { SucursalesService } from '../dist/modules/sucursales/sucursales.service.js';
import { parseAuthTestDatabaseUrl } from './safe-local-auth-target.mjs';

const databaseUrl = process.env.DATABASE_URL;
parseAuthTestDatabaseUrl(databaseUrl);

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

  // Ejecuta los métodos reales de los cuatro servicios: alta y edición deben
  // confirmar negocio + SUCCEEDED juntas, y revertir ante FK de actor inválida.
  const clients = new ClientesService(prisma);
  const catalog = new CatalogoService(prisma);
  const couriers = new RepartidoresService(prisma);
  const branches = new SucursalesService(prisma, { get: () => undefined });
  const catalogCases = [
    { name: 'clientes', create: (nombre) => clients.create({ nombre, celular: `555${suffix.slice(0, 7)}`, direccion: 'Fixture DB aislado', manejaMedioLitro: true }), update: (id, nombre) => clients.update(id, { nombre }),
      find: (nombre) => prisma.cliente.findFirst({ where: { nombre } }), delete: (id) => prisma.cliente.deleteMany({ where: { id } }) },
    { name: 'sabores', create: (nombre) => catalog.createSabor({ nombre }), update: (id, nombre) => catalog.updateSabor(id, { nombre }),
      find: (nombre) => prisma.sabor.findFirst({ where: { nombre } }), delete: (id) => prisma.sabor.deleteMany({ where: { id } }) },
    { name: 'repartidores', create: (nombre) => couriers.create({ nombre }), update: (id, nombre) => couriers.update(id, { nombre }),
      find: (nombre) => prisma.repartidor.findFirst({ where: { nombre } }), delete: (id) => prisma.repartidor.deleteMany({ where: { id } }) },
    { name: 'sucursales', create: (nombre) => branches.createSucursal({ nombre }), update: (id, nombre) => branches.updateSucursal(id, { nombre }),
      find: (nombre) => prisma.sucursal.findUnique({ where: { nombre } }), delete: (id) => prisma.sucursal.deleteMany({ where: { id } }) },
  ];
  const catalogFixtureIds = [];
  for (const item of catalogCases) {
    const createName = `Auth audit ${item.name} ${suffix}`;
    const failedCreateRequestId = `audit-${item.name}-create-rollback-${suffix}`;
    let createRolledBack = false;
    try {
      await runWithAuditRequestContext({ requestId: failedCreateRequestId, route: `/api/${item.name}`, method: 'POST', actorUserId: 2147483647 }, () => item.create(`${createName} failed`));
    } catch { createRolledBack = true; }
    if (!createRolledBack || await item.find(`${createName} failed`)) throw new Error(`Alta ${item.name}: la falla de auditoría no revirtió el alta.`);

    const created = await runWithAuditRequestContext({ requestId: `audit-${item.name}-create-success-${suffix}`, route: `/api/${item.name}`, method: 'POST', actorUserId: actor.id }, () => item.create(createName));
    catalogFixtureIds.push({ item, id: created.id });
    const createTerminals = await prisma.eventoAuditoria.findMany({ where: { requestId: `audit-${item.name}-create-success-${suffix}`, accion: { in: ['MUTATION_SUCCEEDED', 'MUTATION_FAILED'] } } });
    if (createTerminals.length !== 1 || createTerminals[0].accion !== 'MUTATION_SUCCEEDED' || createTerminals[0].actorUsuarioId !== actor.id) throw new Error(`Alta ${item.name}: terminal de éxito ausente, duplicado o sin actor.`);

    const failedUpdateRequestId = `audit-${item.name}-update-rollback-${suffix}`;
    let updateRolledBack = false;
    try {
      await runWithAuditRequestContext({ requestId: failedUpdateRequestId, route: `/api/${item.name}/${created.id}`, method: 'PATCH', actorUserId: 2147483647 }, () => item.update(created.id, `${createName} changed`));
    } catch { updateRolledBack = true; }
    if (!updateRolledBack || !await item.find(createName) || await item.find(`${createName} changed`)) throw new Error(`Edición ${item.name}: la falla de auditoría no revirtió la edición.`);

    await runWithAuditRequestContext({ requestId: `audit-${item.name}-update-success-${suffix}`, route: `/api/${item.name}/${created.id}`, method: 'PATCH', actorUserId: actor.id }, () => item.update(created.id, `${createName} updated`));
    const updateTerminals = await prisma.eventoAuditoria.findMany({ where: { requestId: `audit-${item.name}-update-success-${suffix}`, accion: { in: ['MUTATION_SUCCEEDED', 'MUTATION_FAILED'] } } });
    if (updateTerminals.length !== 1 || updateTerminals[0].accion !== 'MUTATION_SUCCEEDED' || updateTerminals[0].actorUsuarioId !== actor.id || !await item.find(`${createName} updated`)) throw new Error(`Edición ${item.name}: cambio y terminal no quedaron confirmados una sola vez.`);
  }
  for (const { item, id } of catalogFixtureIds) await item.delete(id);
  process.stdout.write('PASS: altas y ediciones reales de clientes, sabores, repartidores y sucursales; rollback ante fallo de auditoría y un solo SUCCEEDED con actor en PostgreSQL.\n');

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
