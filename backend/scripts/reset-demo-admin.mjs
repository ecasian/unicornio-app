import { createInterface } from 'node:readline/promises';
import process, { stdin, stdout } from 'node:process';
import { URL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../dist/modules/auth/password-hasher.js';

const DATABASE_NAME = 'auth_rbac_audit_test';
const TARGET_EMAIL = 'auth-demo-admin@example.invalid';
const CONFIRMATION = `${DATABASE_NAME}/${TARGET_EMAIL}`;
const prisma = new PrismaClient();

async function readMasked(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Este comando requiere una terminal interactiva para ocultar la contraseña.');
  }
  stdout.write(label);
  stdin.setEncoding('utf8');
  stdin.setRawMode(true);
  stdin.resume();
  let value = '';
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          reject(new Error('Restablecimiento cancelado.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\r\n');
          resolve(value);
          return;
        }
        if (character === '\u0008' || character === '\u007f') {
          if (value.length) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        if (character >= ' ') {
          value += character;
          stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

function localOrigin() {
  const value = process.env.PUBLIC_ORIGIN;
  if (!value) throw new Error('PUBLIC_ORIGIN debe apuntar al proxy local para verificar el login.');
  const origin = new URL(value);
  if (origin.origin !== value || !['http:', 'https:'].includes(origin.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) {
    throw new Error('PUBLIC_ORIGIN debe ser un origen loopback HTTP(S), sin ruta.');
  }
  return value;
}

function cookiePairs(response) {
  return response.headers.getSetCookie().map((header) => header.split(';', 1)[0]);
}

async function verifyLocalLogin(origin, expectedUserId, password) {
  const csrfResponse = await globalThis.fetch(`${origin}/api/auth/csrf`);
  if (!csrfResponse.ok) throw new Error(`No se pudo iniciar verificación CSRF (HTTP ${csrfResponse.status}).`);
  const csrf = await csrfResponse.json();
  const csrfCookies = cookiePairs(csrfResponse);
  const loginResponse = await globalThis.fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: csrfCookies.join('; '),
      'X-CSRF-Token': csrf.csrfToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: TARGET_EMAIL, password }),
  });
  if (!loginResponse.ok) throw new Error(`El login local de verificación devolvió HTTP ${loginResponse.status}.`);
  const loginBody = await loginResponse.json();
  if (loginBody.user?.id !== expectedUserId || loginBody.user?.email !== TARGET_EMAIL || 'passwordHash' in loginBody.user) {
    throw new Error('El login no devolvió la identidad pública DEMO esperada.');
  }

  const sessionCookies = cookiePairs(loginResponse);
  const logoutResponse = await globalThis.fetch(`${origin}/api/auth/logout`, {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: sessionCookies.join('; '),
      'X-CSRF-Token': loginResponse.headers.get('x-csrf-token') ?? '',
    },
  });
  if (!logoutResponse.ok) throw new Error(`La sesión de verificación no pudo cerrarse (HTTP ${logoutResponse.status}).`);

  const sessionResponse = await globalThis.fetch(`${origin}/api/auth/session`, { headers: { Cookie: sessionCookies.join('; ') } });
  if (sessionResponse.status !== 401) throw new Error('La sesión de verificación siguió activa después del logout.');
}

async function main() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Ejecuta este comando directamente desde una terminal interactiva; la contraseña no se leerá por pipe.');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL debe apuntar explícitamente a auth_rbac_audit_test.');
  const databaseUrl = new URL(process.env.DATABASE_URL);
  if (databaseUrl.pathname.slice(1) !== DATABASE_NAME
    || !['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname)) {
    throw new Error('Destino rechazado: solo se permite auth_rbac_audit_test en PostgreSQL loopback local.');
  }
  const origin = localOrigin();
  const health = await globalThis.fetch(`${origin}/api/health`, { signal: globalThis.AbortSignal.timeout(5000) });
  if (!health.ok) throw new Error(`El proxy local no está listo (health HTTP ${health.status}).`);

  const [{ current_database: database }] = await prisma.$queryRaw`SELECT current_database()`;
  if (database !== DATABASE_NAME) throw new Error('La conexión no llegó a auth_rbac_audit_test.');
  const target = await prisma.usuarioInterno.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, email: true, activo: true, roles: { select: { rol: { select: { codigo: true } } } } },
  });
  if (!target?.activo || !target.roles.some(({ rol }) => rol.codigo === 'ADMIN_GENERAL')) {
    throw new Error('La cuenta DEMO no existe activa con rol ADMIN_GENERAL; no se modificó ningún usuario.');
  }

  stdout.write(`Destino verificado: ${database}; cuenta activa ${target.email}; rol ADMIN_GENERAL.\n`);
  const readline = createInterface({ input: stdin, output: stdout });
  const confirmation = await readline.question(`Para continuar escribe exactamente ${CONFIRMATION}: `);
  readline.close();
  if (confirmation !== CONFIRMATION) throw new Error('La confirmación no coincidió; no se modificó la cuenta.');

  let password = await readMasked('Nueva contraseña (12 a 128 caracteres): ');
  if (password.length < 12 || password.length > 128) throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');
  const repeated = await readMasked('Repite la nueva contraseña: ');
  if (password !== repeated) throw new Error('Las contraseñas no coinciden; no se modificó la cuenta.');
  const passwordHash = await hashPassword(password);
  const revoked = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "UsuarioInterno" WHERE id = ${target.id} FOR UPDATE`;
    const lockedTarget = await tx.usuarioInterno.findUnique({
      where: { id: target.id },
      select: { email: true, activo: true, roles: { select: { rol: { select: { codigo: true } } } } },
    });
    if (lockedTarget?.email !== TARGET_EMAIL || !lockedTarget.activo
      || !lockedTarget.roles.some(({ rol }) => rol.codigo === 'ADMIN_GENERAL')) {
      throw new Error('La identidad o el estado cambió durante el proceso; no se aplicó el restablecimiento.');
    }
    await tx.usuarioInterno.update({ where: { id: target.id }, data: { passwordHash } });
    const revocation = await tx.sesion.updateMany({ where: { usuarioId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.eventoAuditoria.create({ data: {
      accion: 'USER_PASSWORD_RESET_LOCAL',
      ruta: 'local-auth-reset-cli',
      metodo: 'CLI',
      resultado: 'SUCCESS',
      metadata: { userId: target.id, database: DATABASE_NAME, sesionesRevocadas: revocation.count },
    } });
    return revocation.count;
  });

  await verifyLocalLogin(origin, target.id, repeated);
  stdout.write(`PASS: contraseña Argon2id actualizada para ${TARGET_EMAIL}; ${revoked} sesión(es) previa(s) revocada(s); login y logout local verificados.\n`);
}

try {
  await main();
} catch (error) {
  stdout.write(`${error instanceof Error ? error.message : 'Restablecimiento fallido.'}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
