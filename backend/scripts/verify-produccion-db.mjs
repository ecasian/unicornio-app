import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/db/prisma.service.js';

const database = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['localhost', '127.0.0.1', '::1'].includes(database.hostname), 'Este verificador solo permite PostgreSQL local');
const app = await NestFactory.create(AppModule, { logger: false });
const prisma = app.get(PrismaService);
const suffix = randomUUID().slice(0, 8);
const fixture = { clienteIds: [], repartidorId: undefined, saborId: undefined };

try {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const port = app.getHttpServer().address().port;
  const presentations = await prisma.presentacion.findMany({ orderBy: { litrosEquivalentes: 'desc' } });
  const litro = presentations.find((item) => item.litrosEquivalentes === 1);
  const medio = presentations.find((item) => item.litrosEquivalentes === 0.5);
  assert.ok(litro && medio, 'Deben existir las presentaciones globales 1 litro y 1/2 litro');
  const clientes = [];
  for (const name of ['Visita múltiple', 'Visita sin pedido vigente']) {
    const cliente = await prisma.cliente.create({
      data: { nombre: `Producción ${name} ${suffix}`, celular: '0000000000', direccion: 'Fixture temporal', manejaMedioLitro: true },
    });
    clientes.push(cliente);
    fixture.clienteIds.push(cliente.id);
  }
  const repartidor = await prisma.repartidor.create({ data: { nombre: `Producción repartidor ${suffix}` } });
  fixture.repartidorId = repartidor.id;
  const sabor = await prisma.sabor.create({ data: { nombre: `Producción sabor ${suffix}` } });
  fixture.saborId = sabor.id;

  const target = '2026-10-05';
  const start = new Date('2026-10-05T06:00:00.000Z');
  const end = new Date('2026-10-06T06:00:00.000Z');
  const visit = (clienteId, llegadaAt) => prisma.visitaCliente.create({ data: { clienteId, repartidorId: repartidor.id, llegadaAt } });
  const snapshot = (clienteId, visitaClienteId, corrigeRegistroExistenciasId) => prisma.registroExistencias.create({
    data: { clienteId, repartidorId: repartidor.id, visitaClienteId, corrigeRegistroExistenciasId },
  });
  const order = (clienteId, registroExistenciasId, cantidad, estado = 'VIGENTE') => prisma.pedidoProduccion.create({
    data: { clienteId, repartidorId: repartidor.id, registroExistenciasId, estado,
      detalles: { create: { saborId: sabor.id, presentacionId: litro.id, cantidadSugerida: cantidad, cantidadSolicitada: cantidad } } },
  });

  const visitOne = await visit(clientes[0].id, new Date(start.getTime() + 1000));
  const recordOne = await snapshot(clientes[0].id, visitOne.id);
  const firstOrder = await order(clientes[0].id, recordOne.id, 2);
  const visitTwo = await visit(clientes[0].id, new Date(start.getTime() + 2 * 60 * 60 * 1000));
  const oldRecord = await snapshot(clientes[0].id, visitTwo.id);
  const oldOrder = await order(clientes[0].id, oldRecord.id, 90, 'SUSTITUIDO');
  const correctedRecord = await snapshot(clientes[0].id, visitTwo.id, oldRecord.id);
  const correctedOrder = await order(clientes[0].id, correctedRecord.id, 4);
  const visitWithoutOrder = await visit(clientes[1].id, new Date(start.getTime() + 3 * 60 * 60 * 1000));
  const replacedRecord = await snapshot(clientes[1].id, visitWithoutOrder.id);
  const replacedOrder = await order(clientes[1].id, replacedRecord.id, 60, 'SUSTITUIDO');
  await snapshot(clientes[1].id, visitWithoutOrder.id, replacedRecord.id);
  const endBoundaryVisit = await visit(clientes[1].id, end);
  const endBoundaryRecord = await snapshot(clientes[1].id, endBoundaryVisit.id);
  const boundaryOrder = await order(clientes[1].id, endBoundaryRecord.id, 70);
  const legacyRecord = await prisma.registroExistencias.create({ data: { clienteId: clientes[1].id, repartidorId: repartidor.id } });
  const legacyOrder = await order(clientes[1].id, legacyRecord.id, 80);

  const before = {
    pedidos: await prisma.pedidoProduccion.findMany({ where: { clienteId: { in: fixture.clienteIds } }, include: { detalles: true } }),
    registros: await prisma.registroExistencias.findMany({ where: { clienteId: { in: fixture.clienteIds } } }),
  };
  const base = `http://127.0.0.1:${port}/api/produccion`;
  const result = await globalThis.fetch(`${base}?fecha=${target}`);
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.fecha, target);
  assert.equal(body.timezone, 'America/Mexico_City');
  const customer = body.tiendas.find((item) => item.clienteId === clientes[0].id);
  assert.ok(customer, 'Debe incluir la tienda con producción vigente');
  assert.equal(customer.pedidos.length, 2, 'Debe mantener ambas visitas del mismo cliente como pedidos separados');
  assert.deepEqual(customer.pedidos.map((item) => item.pedidoProduccionId), [firstOrder.id, correctedOrder.id]);
  assert.equal(customer.pedidos.find((item) => item.pedidoProduccionId === correctedOrder.id).visitaClienteId, visitTwo.id,
    'La corrección posterior conserva fecha y visita original');
  assert.equal(customer.pedidos.flatMap((item) => item.detalles).reduce((sum, item) => sum + item.cantidad, 0), 6);
  assert.deepEqual(body.consolidado.map((item) => [item.saborId, item.presentacionId, item.cantidad]), [[sabor.id, litro.id, 6]]);
  const returnedOrderIds = body.tiendas.flatMap((item) => item.pedidos.map((pedido) => pedido.pedidoProduccionId));
  assert.ok(!returnedOrderIds.includes(oldOrder.id), 'El pedido sustituido no debe aparecer');
  assert.ok(!returnedOrderIds.includes(replacedOrder.id), 'Un snapshot corregido sin pedido vigente no debe aparecer');
  assert.ok(!returnedOrderIds.includes(legacyOrder.id), 'Los registros históricos sin visita se excluyen');
  assert.ok(!returnedOrderIds.includes(boundaryOrder.id), 'La llegada en el límite final pertenece al día siguiente');
  assert.ok(!body.tiendas.some((item) => item.clienteId === clientes[1].id), 'No debe quedar una tienda visible si su pedido de ese día fue sustituido sin reemplazo');

  const nextDay = await globalThis.fetch(`${base}?fecha=2026-10-06`);
  const nextDayBody = await nextDay.json();
  const nextDayFixture = nextDayBody.tiendas.filter((item) => fixture.clienteIds.includes(item.clienteId));
  assert.deepEqual(nextDayFixture.map((item) => item.pedidos.map((pedido) => pedido.pedidoProduccionId)), [[boundaryOrder.id]],
    'Solo la visita situada en el límite inicial del día siguiente aparece en esa fecha; la corrección conserva su día original');
  const defaultDay = await globalThis.fetch(base);
  assert.equal(defaultDay.status, 200, 'La fecha por defecto debe resolver un día local y responder');
  const empty = await globalThis.fetch(`${base}?fecha=2099-10-07`);
  assert.deepEqual(await empty.json(), { fecha: '2099-10-07', timezone: 'America/Mexico_City', tiendas: [], consolidado: [] });
  assert.equal((await globalThis.fetch(`${base}?fecha=2026-02-30`)).status, 400);
  const after = {
    pedidos: await prisma.pedidoProduccion.findMany({ where: { clienteId: { in: fixture.clienteIds } }, include: { detalles: true } }),
    registros: await prisma.registroExistencias.findMany({ where: { clienteId: { in: fixture.clienteIds } } }),
  };
  assert.deepEqual(after, before, 'La API de producción es de solo lectura');
  console.log('Producción D-1 verificada contra PostgreSQL local: límites de fecha, visitas múltiples, correcciones, vigencia, histórico y solo lectura.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (fixture.clienteIds.length) {
    await prisma.movimientoBitacora.deleteMany({ where: { clienteId: { in: fixture.clienteIds } } });
    await prisma.detallePedido.deleteMany({ where: { pedidoProduccion: { clienteId: { in: fixture.clienteIds } } } });
    await prisma.pedidoProduccion.deleteMany({ where: { clienteId: { in: fixture.clienteIds } } });
    await prisma.detalleExistencias.deleteMany({ where: { registroExistencias: { clienteId: { in: fixture.clienteIds } } } });
    const records = await prisma.registroExistencias.findMany({ where: { clienteId: { in: fixture.clienteIds } }, orderBy: { id: 'desc' } });
    for (const record of records) await prisma.registroExistencias.delete({ where: { id: record.id } });
    await prisma.visitaCliente.deleteMany({ where: { clienteId: { in: fixture.clienteIds } } });
    await prisma.cliente.deleteMany({ where: { id: { in: fixture.clienteIds } } });
  }
  if (fixture.saborId) {
    await prisma.saborPresentacion.deleteMany({ where: { saborId: fixture.saborId } });
    await prisma.sabor.delete({ where: { id: fixture.saborId } });
  }
  if (fixture.repartidorId) await prisma.repartidor.delete({ where: { id: fixture.repartidorId } });
  await app.close();
}
