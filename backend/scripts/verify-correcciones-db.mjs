import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { URL } from 'node:url';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/db/prisma.service.js';
import { STOCK_OBJETIVO_LOCK_NAMESPACE } from '../dist/modules/stock-objetivo/stock-objetivo.service.js';

const database = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['localhost', '127.0.0.1'].includes(database.hostname), 'Este verificador solo permite PostgreSQL local');
const app = await NestFactory.create(AppModule, { logger: false });
const prisma = app.get(PrismaService);
const suffix = randomUUID().slice(0, 8);
const triggerName = `verify_correction_${suffix}`;
const functionName = `verify_correction_fail_${suffix}`;
let fixture;
let triggerTable;
let functionCreated = false;

try {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const port = app.getHttpServer().address().port;
  const presentaciones = await prisma.presentacion.findMany({ orderBy: { litrosEquivalentes: 'desc' } });
  assert.deepEqual(presentaciones.map((p) => p.litrosEquivalentes), [1, 0.5]);
  const cliente = await prisma.cliente.create({ data: { nombre: `Corrección ${suffix}`, celular: '0000000000', direccion: 'Temporal', manejaMedioLitro: true } });
  const repartidor = await prisma.repartidor.create({ data: { nombre: `Repartidor ${suffix}` } });
  const sabor = await prisma.sabor.create({ data: { nombre: `Sabor ${suffix}` } });
  fixture = { clienteId: cliente.id, repartidorId: repartidor.id, saborId: sabor.id };
  await prisma.saborPresentacion.createMany({ data: presentaciones.map((p) => ({ saborId: sabor.id, presentacionId: p.id, habilitada: true })) });
  await prisma.stockObjetivo.createMany({ data: presentaciones.map((p) => ({ clienteId: cliente.id, saborId: sabor.id,
    presentacionId: p.id, cantidad: p.litrosEquivalentes === 1 ? 10 : 6 })) });
  const visita = await prisma.visitaCliente.create({ data: { clienteId: cliente.id, repartidorId: repartidor.id } });
  const base = `http://127.0.0.1:${port}/api/clientes/${cliente.id}/registros-existencias`;
  const items = (uno, medio) => presentaciones.map((p) => ({ saborId: sabor.id, presentacionId: p.id,
    cantidad: p.litrosEquivalentes === 1 ? uno : medio }));
  const send = (url, body) => globalThis.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const create = (existencias) => send(base, { repartidorId: repartidor.id, visitaClienteId: visita.id, existencias });
  const correct = (id, existencias) => send(`${base}/${id}/correcciones`, { existencias });
  const expectCreated = async (response) => { const body = await response.json(); assert.equal(response.status, 201, JSON.stringify(body)); return body; };
  const order = async (id) => prisma.pedidoProduccion.findUniqueOrThrow({ where: { id }, include: { detalles: true, movimiento: true } });

  const a = await expectCreated(await create(items(9, 6)));
  assert.equal(a.corrigeRegistroExistenciasId, null);
  assert.equal(a.vigente, true);
  for (const detail of a.detalles) {
    assert.equal(detail.sabor.nombre, sabor.nombre);
    assert.equal(detail.presentacion.nombre, presentaciones.find((p) => p.id === detail.presentacionId)?.nombre);
  }
  assert.equal(a.pedidoProduccion.estado, 'VIGENTE');
  assert.deepEqual(a.pedidoProduccion.detalles.map((d) => d.cantidadSolicitada), [1]);
  assert.equal((await correct(a.id, [items(7, 6)[0]])).status, 400, 'Faltante');
  assert.equal((await correct(a.id, [...items(7, 6), items(7, 6)[0]])).status, 400, 'Duplicado');
  assert.equal((await correct(a.id, [...items(7, 6), { saborId: sabor.id, presentacionId: -1, cantidad: 0 }])).status, 400, 'Extra');
  assert.equal((await correct(a.id, [items(7, 6)[0], { saborId: sabor.id, presentacionId: -1, cantidad: 0 }])).status,
    400, 'Combinación distinta con el mismo número de filas');
  assert.equal((await correct(a.id, items(-1, 6))).status, 400, 'Negativo');
  assert.equal((await correct(a.id, items(1.5, 6))).status, 400, 'Decimal');
  assert.equal((await send(`${base}/${a.id}/correcciones`, { existencias: items(7, 6), repartidorId: -1 })).status, 400, 'Contexto inyectado');

  const b = await expectCreated(await correct(a.id, items(7, 6)));
  assert.equal(b.corrigeRegistroExistenciasId, a.id);
  assert.equal(b.clienteId, cliente.id);
  assert.equal(b.repartidorId, repartidor.id);
  assert.equal(b.visitaClienteId, visita.id);
  assert.equal(b.pedidoProduccion.estado, 'VIGENTE');
  assert.deepEqual(b.pedidoProduccion.detalles.map((d) => [d.cantidadSugerida, d.cantidadSolicitada]), [[3, 3]]);
  assert.equal((await order(a.pedidoProduccion.id)).estado, 'SUSTITUIDO');
  assert.equal((await order(a.pedidoProduccion.id)).detalles[0].cantidadSolicitada, 1, 'Pedido histórico intacto');
  assert.equal((await prisma.registroExistencias.findUniqueOrThrow({ where: { id: a.id }, include: { detalles: true } })).detalles[0].cantidad, 9);
  assert.equal((await globalThis.fetch(`${base}/${a.id}`).then((r) => r.json())).vigente, false);
  assert.equal((await correct(a.id, items(6, 6))).status, 409, 'No crear segunda rama');

  const c = await expectCreated(await correct(b.id, items(10, 6)));
  assert.equal(c.corrigeRegistroExistenciasId, b.id);
  assert.equal(c.requiereProduccion, false);
  assert.equal(c.pedidoProduccion, null);
  assert.equal((await order(b.pedidoProduccion.id)).estado, 'SUSTITUIDO');
  assert.equal((await globalThis.fetch(`${base}/${b.id}`).then((r) => r.json())).corregidoPorRegistroExistenciasId, c.id);
  const d = await expectCreated(await correct(c.id, items(8, 6)));
  assert.equal(d.pedidoProduccion.estado, 'VIGENTE', 'Sin pedido → pedido');
  assert.equal(d.pedidoProduccion.detalles[0].cantidadSolicitada, 2);
  const e = await expectCreated(await correct(d.id, items(10, 6)));
  assert.equal(e.pedidoProduccion, null);
  const f = await expectCreated(await correct(e.id, items(11, 6)));
  assert.equal(f.pedidoProduccion, null, 'Sin pedido → sin pedido');

  await assert.rejects(prisma.registroExistencias.create({ data: { clienteId: cliente.id, repartidorId: repartidor.id,
    visitaClienteId: visita.id, corrigeRegistroExistenciasId: a.id } }), { code: 'P2002' });
  await assert.rejects(prisma.registroExistencias.create({ data: { clienteId: cliente.id, repartidorId: repartidor.id,
    visitaClienteId: visita.id, corrigeRegistroExistenciasId: -1 } }), { code: 'P2003' });
  await assert.rejects(prisma.$executeRaw`UPDATE "RegistroExistencias" SET "corrigeRegistroExistenciasId" = ${f.id} WHERE id = ${f.id}`,
    (error) => { assert.match(String(error), /RegistroExistencias_no_autocorreccion_check/); return true; });
  const legacy = await prisma.registroExistencias.create({ data: { clienteId: cliente.id, repartidorId: repartidor.id } });
  assert.equal((await globalThis.fetch(`${base}/${legacy.id}`)).status, 200);
  assert.equal((await correct(legacy.id, items(10, 6))).status, 409, 'Histórico sin visita: solo lectura');
  const legacyOrder = await prisma.pedidoProduccion.create({ data: { clienteId: cliente.id,
    repartidorId: repartidor.id, registroExistenciasId: legacy.id,
    detalles: { create: { saborId: sabor.id, presentacionId: presentaciones[0].id,
      cantidadSugerida: 1, cantidadSolicitada: 1 } } } });
  assert.equal(legacyOrder.estado, 'VIGENTE', 'Los pedidos históricos tienen el estado por defecto');
  assert.equal((await globalThis.fetch(`${base}/${legacy.id}`).then((r) => r.json())).pedidoProduccion.estado, 'VIGENTE');

  const raceBase = await expectCreated(await create(items(10, 6)));
  let releaseLock;
  let lockReady;
  const held = new Promise((resolve) => { releaseLock = resolve; });
  const ready = new Promise((resolve) => { lockReady = resolve; });
  const blocker = prisma.$transaction(async (tx) => {
    const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid()::integer AS pid`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${STOCK_OBJETIVO_LOCK_NAMESPACE}::integer, ${cliente.id}::integer)`;
    lockReady(pid);
    await held;
  }, { timeout: 15000 });
  let competing;
  try {
    const blockerPid = await ready;
    let settled = false;
    const requests = Promise.all([correct(raceBase.id, items(9, 6)), correct(raceBase.id, items(8, 6))])
      .then((responses) => { settled = true; return responses; });
    const deadline = Date.now() + 10000;
    let blocked = false;
    while (Date.now() < deadline) {
      assert.equal(settled, false, 'Las correcciones no pueden terminar con el advisory lock retenido');
      const waiting = await prisma.$queryRaw`SELECT pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%pg_advisory_xact_lock%'`;
      if (waiting.filter((session) => session.blockers.includes(blockerPid)).length >= 2) { blocked = true; break; }
      await nextTurn();
    }
    assert.equal(blocked, true, 'Ambos POST deben esperar simultáneamente el lock del mismo cliente');
    releaseLock();
    await blocker;
    competing = await requests;
  } finally {
    releaseLock();
    await blocker;
  }
  assert.deepEqual(competing.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await prisma.registroExistencias.count({ where: { corrigeRegistroExistenciasId: raceBase.id } }), 1);
  const raceWinner = await competing.find((response) => response.status === 201).json();

  const before = {
    registros: await prisma.registroExistencias.count({ where: { clienteId: cliente.id } }),
    pedidos: await prisma.pedidoProduccion.count({ where: { clienteId: cliente.id } }),
    movimientos: await prisma.movimientoBitacora.count({ where: { clienteId: cliente.id } }),
  };
  async function failure(table, event, condition, payload = items(10, 6)) {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$ BEGIN
      IF ${condition} THEN RAISE EXCEPTION 'Fallo forzado de corrección'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    functionCreated = true;
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE ${event} ON "${table}"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
    triggerTable = table;
    const response = await correct(raceWinner.id, payload);
    assert.equal(response.status, 500, `${table}: el fallo debe abortar la corrección`);
    assert.deepEqual({
      registros: await prisma.registroExistencias.count({ where: { clienteId: cliente.id } }),
      pedidos: await prisma.pedidoProduccion.count({ where: { clienteId: cliente.id } }),
      movimientos: await prisma.movimientoBitacora.count({ where: { clienteId: cliente.id } }),
    }, before, `${table}: rollback completo`);
    assert.equal((await order(raceWinner.pedidoProduccion.id)).estado, 'VIGENTE', 'El pedido anterior no debe quedar sustituido');
    assert.equal(await prisma.registroExistencias.count({ where: { corrigeRegistroExistenciasId: raceWinner.id } }), 0);
    await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "${table}"`);
    triggerTable = undefined;
    await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
    functionCreated = false;
  }
  await failure('RegistroExistencias', 'INSERT', `NEW."clienteId" = ${cliente.id}`);
  await failure('PedidoProduccion', 'UPDATE', `NEW."clienteId" = ${cliente.id} AND NEW."estado" = 'SUSTITUIDO'`);
  await failure('DetalleExistencias', 'INSERT', `NEW."saborId" = ${sabor.id}`);
  await failure('MovimientoBitacora', 'INSERT', `NEW."clienteId" = ${cliente.id}`);
  await failure('PedidoProduccion', 'INSERT', `NEW."clienteId" = ${cliente.id}`, items(7, 6));
  await failure('DetallePedido', 'INSERT', `NEW."saborId" = ${sabor.id}`, items(7, 6));
  await failure('MovimientoBitacora', 'INSERT', `NEW."clienteId" = ${cliente.id} AND NEW."tipo" = 'PEDIDO_PRODUCCION'`, items(7, 6));

  await prisma.saborPresentacion.update({ where: { saborId_presentacionId: { saborId: sabor.id, presentacionId: presentaciones[1].id } },
    data: { habilitada: false } });
  assert.equal((await correct(raceWinner.id, items(10, 6))).status, 409, 'Surtido ya no operable');
  await prisma.saborPresentacion.update({ where: { saborId_presentacionId: { saborId: sabor.id, presentacionId: presentaciones[1].id } },
    data: { habilitada: true } });
  await prisma.stockObjetivo.update({ where: { clienteId_saborId_presentacionId: {
    clienteId: cliente.id, saborId: sabor.id, presentacionId: presentaciones[0].id,
  } }, data: { cantidad: 12 } });
  const recalculated = await expectCreated(await correct(raceWinner.id, items(9, 6)));
  assert.equal(recalculated.pedidoProduccion.detalles[0].cantidadSolicitada, 3,
    'La corrección calcula contra el StockObjetivo vigente, no el del snapshot original');
  assert.equal((await globalThis.fetch(`${base}/${a.id}`)).status, 200, 'El origen histórico sigue consultable');
  console.log('Correcciones verificadas en PostgreSQL local: cadena, pedidos, conflictos, concurrencia, FK/UNIQUE/CHECK y rollback.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (triggerTable) await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "${triggerTable}"`);
  if (functionCreated) await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
  if (fixture) {
    const { clienteId, repartidorId, saborId } = fixture;
    await prisma.movimientoBitacora.deleteMany({ where: { clienteId } });
    await prisma.detallePedido.deleteMany({ where: { pedidoProduccion: { clienteId } } });
    await prisma.pedidoProduccion.deleteMany({ where: { clienteId } });
    await prisma.detalleExistencias.deleteMany({ where: { registroExistencias: { clienteId } } });
    const registros = await prisma.registroExistencias.findMany({ where: { clienteId }, orderBy: { id: 'desc' } });
    for (const registro of registros) await prisma.registroExistencias.delete({ where: { id: registro.id } });
    await prisma.stockObjetivo.deleteMany({ where: { clienteId } });
    await prisma.visitaCliente.deleteMany({ where: { clienteId } });
    await prisma.saborPresentacion.deleteMany({ where: { saborId } });
    await prisma.sabor.delete({ where: { id: saborId } });
    await prisma.repartidor.delete({ where: { id: repartidorId } });
    await prisma.cliente.delete({ where: { id: clienteId } });
  }
  await app.close();
}
