import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/db/prisma.service.js';
import { DEFAULT_BUSINESS_TIMEZONE, resolveBusinessDate } from '../dist/modules/produccion/business-date.js';

const database = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['localhost', '127.0.0.1', '::1'].includes(database.hostname), 'Este verificador solo permite PostgreSQL local');
const app = await NestFactory.create(AppModule, { logger: false });
const prisma = app.get(PrismaService);
const suffix = randomUUID().slice(0, 8);
const fixture = { clienteIds: [], repartidorIds: [] };

async function readScopedState(clienteIds) {
  const where = { clienteId: { in: clienteIds } };
  return {
    visitas: await prisma.visitaCliente.findMany({ where, orderBy: [{ llegadaAt: 'asc' }, { id: 'asc' }] }),
    existencias: await prisma.registroExistencias.findMany({ where }),
    pedidos: await prisma.pedidoProduccion.findMany({ where }),
    movimientos: await prisma.movimientoBitacora.findMany({ where }),
  };
}

try {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/admin/visitas`;
  const timezone = process.env.BUSINESS_TIMEZONE?.trim() || DEFAULT_BUSINESS_TIMEZONE;
  const window = resolveBusinessDate('2026-10-05', timezone);

  const clienteOne = await prisma.cliente.create({
    data: { nombre: `Admin visitas A ${suffix}`, celular: '0000000000', direccion: 'Fixture temporal', manejaMedioLitro: false },
  });
  fixture.clienteIds.push(clienteOne.id);
  const clienteTwo = await prisma.cliente.create({
    data: { nombre: `Admin visitas B ${suffix}`, celular: '0000000000', direccion: 'Fixture temporal', manejaMedioLitro: false },
  });
  fixture.clienteIds.push(clienteTwo.id);
  const repartidorOne = await prisma.repartidor.create({ data: { nombre: `Admin visitas R1 ${suffix}` } });
  fixture.repartidorIds.push(repartidorOne.id);
  const repartidorTwo = await prisma.repartidor.create({ data: { nombre: `Admin visitas R2 ${suffix}` } });
  fixture.repartidorIds.push(repartidorTwo.id);

  const visit = (clienteId, repartidorId, llegadaAt) => prisma.visitaCliente.create({ data: { clienteId, repartidorId, llegadaAt } });
  await visit(clienteOne.id, repartidorOne.id, new Date(window.start.getTime() - 1));
  const atStart = await visit(clienteOne.id, repartidorOne.id, window.start);
  const sameStoreSecond = await visit(clienteOne.id, repartidorOne.id, new Date(window.start.getTime() + 60 * 60 * 1000));
  const otherStore = await visit(clienteTwo.id, repartidorTwo.id, new Date(window.start.getTime() + 2 * 60 * 60 * 1000));
  const beforeEnd = await visit(clienteTwo.id, repartidorOne.id, new Date(window.end.getTime() - 1));
  await visit(clienteTwo.id, repartidorTwo.id, window.end);

  // Historical rows remain queryable after the referenced catalogs are deactivated.
  await prisma.cliente.update({ where: { id: clienteOne.id }, data: { activo: false } });
  await prisma.repartidor.update({ where: { id: repartidorOne.id }, data: { activo: false } });

  const allBefore = await readScopedState(fixture.clienteIds);
  const list = async (query = '') => {
    const response = await globalThis.fetch(`${base}${query}`);
    return { status: response.status, body: await response.json() };
  };

  const all = await list('?fecha=2026-10-05');
  assert.equal(all.status, 200);
  assert.equal(all.body.fecha, '2026-10-05');
  assert.equal(all.body.timezone, timezone);
  assert.equal(all.body.filtros.clienteId, null);
  assert.equal(all.body.filtros.repartidorId, null);
  assert.deepEqual(all.body.visitas.map((item) => item.id), [beforeEnd.id, otherStore.id, sameStoreSecond.id, atStart.id]);
  assert.equal(all.body.visitas.find((item) => item.id === atStart.id).cliente.nombre, clienteOne.nombre);
  assert.equal(all.body.visitas.find((item) => item.id === atStart.id).repartidor.nombre, repartidorOne.nombre);
  assert.equal(all.body.visitas.filter((item) => item.cliente.id === clienteOne.id).length, 2, 'No deduplica visitas repetidas al mismo cliente');
  assert.equal((await list('?fecha=2026-10-05&clienteId=' + clienteOne.id)).body.visitas.length, 2, 'Filtro por cliente');
  assert.equal((await list('?fecha=2026-10-05&repartidorId=' + repartidorOne.id)).body.visitas.length, 3, 'Filtro por repartidor');
  assert.equal((await list(`?fecha=2026-10-05&clienteId=${clienteOne.id}&repartidorId=${repartidorOne.id}`)).body.visitas.length, 2, 'Filtros combinados');
  assert.equal((await list('?fecha=2026-10-06')).body.visitas.some((item) => item.id === beforeEnd.id), false, 'El límite final es exclusivo');
  assert.equal((await list('?fecha=2026-10-04')).body.visitas.some((item) => item.id === atStart.id), false, 'El límite inicial pertenece al día seleccionado');
  assert.deepEqual((await list('?fecha=2099-10-07')).body.visitas, [], 'Un día vacío responde con una lista vacía');
  assert.equal((await list('?fecha=2026-02-30')).status, 400);
  assert.equal((await list('?clienteId=0')).status, 400);
  assert.equal((await list('?repartidorId=1.5')).status, 400);

  const defaultDateBeforeRequest = resolveBusinessDate(undefined, timezone, new Date(), 'today').fecha;
  const defaultResult = await list();
  const defaultDateAfterRequest = resolveBusinessDate(undefined, timezone, new Date(), 'today').fecha;
  assert.equal(defaultResult.status, 200);
  assert.ok([defaultDateBeforeRequest, defaultDateAfterRequest].includes(defaultResult.body.fecha), 'Sin fecha usa hoy en BUSINESS_TIMEZONE');
  assert.equal(defaultResult.body.timezone, timezone);

  const allAfter = await readScopedState(fixture.clienteIds);
  assert.deepEqual(allAfter, allBefore, 'La consulta no cambia visitas, existencias, pedidos ni bitácora');
  console.log('Historial administrativo de visitas verificado con PostgreSQL local: filtros, visitas repetidas, inactivos, límites temporales y solo lectura.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (fixture.clienteIds.length) {
    await prisma.visitaCliente.deleteMany({ where: { clienteId: { in: fixture.clienteIds } } });
    await prisma.registroExistencias.deleteMany({ where: { clienteId: { in: fixture.clienteIds } } });
    await prisma.pedidoProduccion.deleteMany({ where: { clienteId: { in: fixture.clienteIds } } });
    await prisma.movimientoBitacora.deleteMany({ where: { clienteId: { in: fixture.clienteIds } } });
    await prisma.cliente.deleteMany({ where: { id: { in: fixture.clienteIds } } });
  }
  if (fixture.repartidorIds.length) {
    await prisma.repartidor.deleteMany({ where: { id: { in: fixture.repartidorIds } } });
  }
  await app.close();
}
