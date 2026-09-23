import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/db/prisma.service.js';
import { STOCK_OBJETIVO_LOCK_NAMESPACE, StockObjetivoService } from '../dist/modules/stock-objetivo/stock-objetivo.service.js';

const app = await NestFactory.create(AppModule, { logger: ['error'] });
const secondApp = await NestFactory.create(AppModule, { logger: ['error'] });
const prisma = app.get(PrismaService);
const lockPrisma = new PrismaClient();
const auxiliaryPrisma = new PrismaClient();
const { fetch } = globalThis;
let clienteId;
let otroClienteId;
let saborId;

async function put(base, combinaciones) {
  return fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ combinaciones }) });
}

try {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const port = app.getHttpServer().address().port;
  secondApp.setGlobalPrefix('api');
  secondApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await secondApp.listen(0, '127.0.0.1');
  const secondPort = secondApp.getHttpServer().address().port;
  const presentaciones = await prisma.presentacion.findMany({ orderBy: { id: 'asc' } });
  assert.equal(presentaciones.length, 2, 'Se requieren las dos presentaciones globales');
  const litro = presentaciones.find((item) => item.litrosEquivalentes === 1);
  const medio = presentaciones.find((item) => item.litrosEquivalentes === 0.5);
  assert.ok(litro && medio);
  const suffix = randomUUID();
  const cliente = await prisma.cliente.create({ data: { nombre: `Verificación stock ${suffix}`, celular: '0000000000', direccion: 'Prueba temporal', manejaMedioLitro: true } });
  clienteId = cliente.id;
  const otroCliente = await prisma.cliente.create({ data: { nombre: `Verificación stock otro ${suffix}`, celular: '0000000000', direccion: 'Prueba temporal', manejaMedioLitro: true } });
  otroClienteId = otroCliente.id;
  const sabor = await prisma.sabor.create({ data: { nombre: `Sabor prueba ${suffix}` } });
  saborId = sabor.id;
  await prisma.saborPresentacion.createMany({ data: [
    { saborId, presentacionId: litro.id, habilitada: true },
    { saborId, presentacionId: medio.id, habilitada: true },
  ] });
  const base = `http://127.0.0.1:${port}/api/clientes/${clienteId}/stock-objetivo`;
  const uno = { saborId, presentacionId: litro.id, cantidad: 0 };
  const mitad = { saborId, presentacionId: medio.id, cantidad: 6 };

  assert.deepEqual(await (await fetch(base)).json(), []);
  assert.equal((await put(base, [uno, mitad])).status, 200);
  const configured = await (await fetch(base)).json();
  assert.deepEqual(configured.map((row) => row.cantidad), [0, 6]);
  assert.equal(configured[0].sabor.nombre, sabor.nombre);
  assert.equal(configured[0].presentacion.nombre, litro.nombre);
  // Se omite la validación HTTP a propósito para forzar un fallo SQL después de deleteMany.
  await assert.rejects(app.get(StockObjetivoService).replace(clienteId, {
    combinaciones: [{ ...uno, cantidad: -1 }],
  }));
  assert.deepEqual((await prisma.stockObjetivo.findMany({ where: { clienteId }, orderBy: { presentacionId: 'asc' } })).map((row) => [row.presentacionId, row.cantidad]), [
    [litro.id, 0], [medio.id, 6],
  ]);
  await assert.rejects(prisma.stockObjetivo.create({ data: { ...uno, clienteId } }), { code: 'P2002' });
  assert.equal((await put(base, [uno, uno])).status, 400);
  assert.equal((await put(base, [{ ...uno, cantidad: -1 }])).status, 400);
  assert.equal((await put(base, [uno])).status, 200);
  await assert.rejects(prisma.stockObjetivo.create({ data: { ...mitad, clienteId, cantidad: -1 } }));
  assert.deepEqual((await prisma.stockObjetivo.findMany({ where: { clienteId } })).map((row) => [row.presentacionId, row.cantidad]), [[litro.id, 0]]);

  let acquired;
  let release;
  const gateReady = new Promise((resolve) => { acquired = resolve; });
  const gate = lockPrisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${STOCK_OBJETIVO_LOCK_NAMESPACE}::integer, ${clienteId}::integer)`;
    acquired();
    await new Promise((resolve) => { release = resolve; });
  }, { timeout: 12000 });
  await gateReady;
  const first = put(base, [uno]);
  const second = put(`http://127.0.0.1:${secondPort}/api/clientes/${clienteId}/stock-objetivo`, [mitad]);
  let settled;
  try {
    const otherResult = await new StockObjetivoService(auxiliaryPrisma).replace(otroClienteId, { combinaciones: [uno] });
    assert.equal(otherResult.length, 1, 'Un cliente distinto no debe esperar el lock');
    const deadline = Date.now() + 4000;
    let waiting = 0;
    while (Date.now() < deadline) {
      const locks = await auxiliaryPrisma.$queryRaw`SELECT count(*)::integer AS waiting FROM pg_locks WHERE locktype = 'advisory' AND classid = ${STOCK_OBJETIVO_LOCK_NAMESPACE}::oid AND objid = ${clienteId}::oid AND NOT granted`;
      waiting = locks[0].waiting;
      if (waiting === 2) break;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 25));
    }
    assert.equal(waiting, 2, 'Ambos PUT del mismo cliente deben esperar el lock transaccional');
  } finally {
    release();
    await gate;
    settled = await Promise.allSettled([first, second]);
  }
  assert.ok(settled.every((result) => result.status === 'fulfilled'), 'Ambos PUT deben terminar');
  assert.deepEqual(settled.map((result) => result.value.status), [200, 200]);
  const finalConcurrent = await prisma.stockObjetivo.findMany({ where: { clienteId } });
  assert.equal(finalConcurrent.length, 1, 'El resultado de dos PUT concurrentes debe ser un solo payload completo');
  assert.ok([litro.id, medio.id].includes(finalConcurrent[0].presentacionId));

  await prisma.saborPresentacion.update({ where: { saborId_presentacionId: { saborId, presentacionId: medio.id } }, data: { habilitada: false } });
  assert.equal((await put(base, [mitad])).status, 400);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/clientes/2147483647/stock-objetivo`)).status, 404);
  assert.equal((await put(base, [])).status, 200);
  assert.equal(await prisma.stockObjetivo.count({ where: { clienteId } }), 0);
  console.log('StockObjetivo verificado por HTTP y PostgreSQL real: reemplazo, concurrencia por cliente, rollback, cero, restricciones y 404.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (clienteId) await prisma.stockObjetivo.deleteMany({ where: { clienteId } });
  if (otroClienteId) await prisma.stockObjetivo.deleteMany({ where: { clienteId: otroClienteId } });
  if (saborId) await prisma.saborPresentacion.deleteMany({ where: { saborId } });
  if (saborId) await prisma.sabor.delete({ where: { id: saborId } });
  if (clienteId) await prisma.cliente.delete({ where: { id: clienteId } });
  if (otroClienteId) await prisma.cliente.delete({ where: { id: otroClienteId } });
  await auxiliaryPrisma.$disconnect();
  await lockPrisma.$disconnect();
  await secondApp.close();
  await app.close();
}
