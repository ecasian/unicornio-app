import { createInterface } from 'node:readline/promises';
import process, { stdin, stdout } from 'node:process';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../dist/modules/auth/password-hasher.js';

async function readMasked(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') throw new Error('El bootstrap requiere una terminal interactiva para capturar contraseñas sin mostrarlas.');
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
          reject(new Error('Bootstrap cancelado.'));
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

const prisma = new PrismaClient();
try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL debe apuntar explícitamente a la base del entorno que se inicializará.');
  const adminCount = await prisma.usuarioInterno.count({ where: { activo: true, roles: { some: { rol: { codigo: 'ADMIN_GENERAL' } } } } });
  if (adminCount > 0) throw new Error('Ya existe un administrador general activo; el bootstrap inicial no crea otra cuenta.');
  const role = await prisma.rol.findUnique({ where: { codigo: 'ADMIN_GENERAL' } });
  if (!role) throw new Error('Primero aplica la migración de autenticación para cargar los roles.');

  const readline = createInterface({ input: stdin, output: stdout });
  const nombre = (await readline.question('Nombre del primer administrador: ')).trim();
  const email = (await readline.question('Correo del primer administrador: ')).trim().toLowerCase();
  readline.close();
  if (nombre.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Nombre o correo inválido.');
  const password = await readMasked('Contraseña (mínimo 12 caracteres): ');
  if (password.length < 12 || password.length > 128) throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');
  const confirmation = await readMasked('Repite la contraseña: ');
  if (password !== confirmation) throw new Error('Las contraseñas no coinciden.');

  const passwordHash = await hashPassword(password);
  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1398034245::integer, 1::integer)`;
    const activeAdminCount = await tx.usuarioInterno.count({ where: { activo: true, roles: { some: { rol: { codigo: 'ADMIN_GENERAL' } } } } });
    if (activeAdminCount > 0) throw new Error('Ya existe un administrador general activo; el bootstrap inicial no crea otra cuenta.');
    const created = await tx.usuarioInterno.create({ data: {
      nombre,
      email,
      passwordHash,
      roles: { create: { rolId: role.id } },
    } });
    await tx.eventoAuditoria.create({ data: {
      accion: 'BOOTSTRAP_ADMIN_CREATED',
      ruta: 'local-bootstrap',
      metodo: 'CLI',
      resultado: 'SUCCESS',
    } });
    return created;
  });
  stdout.write(`Administrador inicial creado (ID ${user.id}). Guarda sus credenciales en tu gestor seguro.\n`);
} catch (error) {
  stdout.write(`${error instanceof Error ? error.message : 'Bootstrap fallido.'}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
