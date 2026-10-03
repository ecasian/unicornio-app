import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/db/prisma.service.js';
import { STOCK_OBJETIVO_LOCK_NAMESPACE } from '../dist/modules/stock-objetivo/stock-objetivo.service.js';

const app = await NestFactory.create(AppModule, { logger: ['error'] });
const prisma = app.get(PrismaService);
const suffix = randomUUID().slice(0, 8);
const triggerName = `verify_existencias_${suffix}`;
const functionName = `verify_existencias_fail_${suffix}`;
let clienteId;
let repartidorId;
let saborId;
let visitaId;
let otherClienteId;
let otherDriverId;
let triggerCreated = false;
let functionCreated = false;
const orderTriggerName = `verify_pedido_${suffix}`;
const orderFunctionName = `verify_pedido_fail_${suffix}`;
let orderTriggerTable;
let orderFunctionCreated = false;

try {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const port = app.getHttpServer().address().port;
  const presentations = await prisma.presentacion.findMany();
  const litro = presentations.find((item) => item.litrosEquivalentes === 1);
  const medio = presentations.find((item) => item.litrosEquivalentes === 0.5);
  assert.ok(litro && medio, 'Deben existir las dos presentaciones de MVP');

  const cliente = await prisma.cliente.create({ data: { nombre: `Existencias prueba ${suffix}`, celular: '0000000000', direccion: 'Temporal', manejaMedioLitro: true } });
  clienteId = cliente.id;
  const repartidor = await prisma.repartidor.create({ data: { nombre: `Repartidor prueba ${suffix}` } });
  repartidorId = repartidor.id;
  const sabor = await prisma.sabor.create({ data: { nombre: `Sabor prueba ${suffix}` } });
  saborId = sabor.id;
  await prisma.saborPresentacion.createMany({ data: [
    { saborId, presentacionId: litro.id, habilitada: true },
    { saborId, presentacionId: medio.id, habilitada: true },
  ] });
  await prisma.stockObjetivo.createMany({ data: [
    { clienteId, saborId, presentacionId: litro.id, cantidad: 0 },
    { clienteId, saborId, presentacionId: medio.id, cantidad: 6 },
  ] });

  const base = `http://127.0.0.1:${port}/api/clientes/${clienteId}/registros-existencias`;
  const visitasUrl = `http://127.0.0.1:${port}/api/clientes/${clienteId}/visitas`;
  const beforeArrival = Date.now();
  const arrivalResponse = await globalThis.fetch(visitasUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repartidorId }) });
  assert.equal(arrivalResponse.status, 201, 'La llegada debe responder 201');
  const visita = await arrivalResponse.json();
  visitaId = visita.id;
  assert.equal(visita.clienteId, clienteId);
  assert.equal(visita.repartidorId, repartidorId);
  assert.ok(Date.parse(visita.llegadaAt) >= beforeArrival - 1000 && Date.parse(visita.llegadaAt) <= Date.now() + 1000,
    'La hora de llegada debe generarse en la base al crear la visita');
  assert.equal((await prisma.visitaCliente.findUniqueOrThrow({ where: { id: visitaId } })).llegadaAt.toISOString(), visita.llegadaAt);
  await assert.rejects(prisma.visitaCliente.create({ data: { clienteId: -1, repartidorId } }),
    (error) => { assert.equal(error.code, 'P2003', 'FK de Cliente en VisitaCliente'); return true; });
  await assert.rejects(prisma.visitaCliente.create({ data: { clienteId, repartidorId: -1 } }),
    (error) => { assert.equal(error.code, 'P2003', 'FK de Repartidor en VisitaCliente'); return true; });
  assert.equal((await globalThis.fetch(visitasUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repartidorId, llegadaAt: '2000-01-01T00:00:00.000Z' }) })).status, 400);
  const item = (presentacionId, cantidad) => ({ saborId, presentacionId, cantidad });
  const post = (existencias, visit = visitaId) => globalThis.fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repartidorId, visitaClienteId: visit, existencias }) });
  const allZero = [item(litro.id, 0), item(medio.id, 0)];

  const surtidoUrl = `http://127.0.0.1:${port}/api/clientes/${clienteId}/surtido-operativo`;
  const concurrentReads = await Promise.all(Array.from({ length: 40 }, () => globalThis.fetch(surtidoUrl)));
  for (const response of concurrentReads) {
    assert.equal(response.status, 200, 'Las lecturas concurrentes del surtido no deben agotar transacciones');
    assert.equal((await response.json()).length, 2);
  }

  async function waitForBlockedPost(blockerPid, queryMarker, isSettled) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      assert.equal(isSettled(), false, 'El POST terminó antes de esperar el lock administrativo');
      const waiting = await prisma.$queryRaw`
        SELECT query, pg_blocking_pids(pid) AS blockers
        FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
      `;
      if (waiting.some((session) => session.blockers.includes(blockerPid) && session.query.includes(queryMarker))) return;
      await nextTurn();
    }
    throw new Error(`El POST no llegó al lock esperado: ${queryMarker}`);
  }

  async function verifyConcurrentChange(label, queryMarker, change, restore) {
    let announceStarted;
    let rejectStarted;
    let releaseUpdate;
    const started = new Promise((resolve, reject) => { announceStarted = resolve; rejectStarted = reject; });
    const held = new Promise((resolve) => { releaseUpdate = resolve; });
    const administrative = prisma.$transaction(async (transaction) => {
      const [{ pid }] = await transaction.$queryRaw`SELECT pg_backend_pid()::integer AS pid`;
      await change(transaction);
      announceStarted(pid);
      await held;
    }, { timeout: 15000 });
    void administrative.catch(rejectStarted);
    let request;
    let result;
    try {
      const blockerPid = await started;
      let settled = false;
      request = post(allZero).then((response) => { settled = true; return { response }; },
        (error) => { settled = true; return { error }; });
      await waitForBlockedPost(blockerPid, queryMarker, () => settled);
      assert.equal(settled, false, `${label}: el POST debe seguir pendiente mientras el cambio no confirma`);
    } finally {
      releaseUpdate();
      try {
        await administrative;
      } finally {
        if (request) result = await request;
      }
    }
    if (result.error) throw result.error;
    assert.equal(result.response.status, 400, `${label}: el POST debe rechazar el surtido anterior`);
    await restore();
  }

  assert.equal((await post([item(litro.id, 1)])).status, 400, 'Snapshot incompleto');
  assert.equal((await globalThis.fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repartidorId, existencias: allZero }) })).status, 400, 'Nueva escritura sin visita');
  assert.equal((await post(allZero, visitaId + 999999)).status, 404, 'Visita inexistente');
  const anotherClient = await prisma.cliente.create({ data: { nombre: `Visita ajena ${suffix}`, celular: '0000000000',
    direccion: 'Temporal', manejaMedioLitro: true } });
  otherClienteId = anotherClient.id;
  const anotherVisit = await prisma.visitaCliente.create({ data: { clienteId: anotherClient.id, repartidorId } });
  assert.equal((await post(allZero, anotherVisit.id)).status, 400, 'Visita de otro cliente');
  await assert.rejects(prisma.registroExistencias.create({ data: { clienteId, repartidorId, visitaClienteId: anotherVisit.id } }),
    (error) => { assert.equal(error.code, 'P2003', 'FK compuesta de visita y registro'); return true; });
  await prisma.visitaCliente.delete({ where: { id: anotherVisit.id } });
  await prisma.cliente.delete({ where: { id: anotherClient.id } });
  const anotherDriver = await prisma.repartidor.create({ data: { nombre: `Conductor ajeno ${suffix}` } });
  otherDriverId = anotherDriver.id;
  const driverVisit = await prisma.visitaCliente.create({ data: { clienteId, repartidorId: anotherDriver.id } });
  assert.equal((await post(allZero, driverVisit.id)).status, 400, 'Visita de otro repartidor');
  await prisma.visitaCliente.delete({ where: { id: driverVisit.id } });
  await prisma.repartidor.delete({ where: { id: anotherDriver.id } });
  assert.equal((await post([...allZero, item(litro.id, 1)])).status, 400, 'Combinación extra');
  assert.equal((await post([item(litro.id, 1), item(litro.id, 2)])).status, 400, 'Duplicado');
  const created = await post(allZero);
  assert.equal(created.status, 201);
  const registro = await created.json();
  assert.equal(registro.visitaClienteId, visitaId, 'El snapshot debe conservar su visita');
  assert.deepEqual(registro.detalles.map((detail) => detail.cantidad), [0, 0]);
  assert.equal(registro.movimiento.tipo, 'REGISTRO_EXISTENCIAS');
  assert.equal(registro.requiereProduccion, true);
  assert.equal(registro.pedidoProduccion.detalles[0].cantidadSugerida, 6);
  assert.equal((await globalThis.fetch(`${base}/${registro.id}`)).status, 200);
  assert.equal(await prisma.detalleExistencias.count({ where: { registroExistenciasId: registro.id } }), 2);
  assert.equal(await prisma.movimientoBitacora.count({ where: { registroExistenciasId: registro.id } }), 1);

  await assert.rejects(prisma.detalleExistencias.create({ data: {
    registroExistenciasId: registro.id, ...item(litro.id, 1),
  } }), { code: 'P2002' });
  // Cabecera distinta: la inserción no puede fallar por la PK compuesta anterior.
  const registroCheck = await prisma.registroExistencias.create({ data: { clienteId, repartidorId } });
  const historical = await globalThis.fetch(`${base}/${registroCheck.id}`);
  assert.equal(historical.status, 200, 'Un snapshot histórico sin visita debe poder consultarse');
  assert.equal((await historical.json()).visitaClienteId, null);
  await assert.rejects(prisma.detalleExistencias.create({ data: {
    registroExistenciasId: registroCheck.id, ...item(litro.id, -1),
  } }), (error) => {
    assert.match(String(error), /DetalleExistencias_cantidad_check/);
    return true;
  });
  await prisma.registroExistencias.delete({ where: { id: registroCheck.id } });
  await assert.rejects(prisma.$executeRaw`
    INSERT INTO "MovimientoBitacora" ("clienteId", "repartidorId", "tipo", "createdAt")
    VALUES (${clienteId}, ${repartidorId}, 'REGISTRO_EXISTENCIAS'::"TipoMovimiento", CURRENT_TIMESTAMP)
  `);

  await prisma.saborPresentacion.update({ where: { saborId_presentacionId: { saborId, presentacionId: medio.id } }, data: { habilitada: false } });
  assert.equal((await post(allZero)).status, 400, 'Debe rechazar surtido obsoleto');
  await prisma.saborPresentacion.update({ where: { saborId_presentacionId: { saborId, presentacionId: medio.id } }, data: { habilitada: true } });

  await verifyConcurrentChange('Cliente inactivo', 'FROM "Cliente"',
    (transaction) => transaction.cliente.update({ where: { id: clienteId }, data: { activo: false } }),
    () => prisma.cliente.update({ where: { id: clienteId }, data: { activo: true } }));
  await verifyConcurrentChange('Sabor inactivo', 'FOR SHARE OF s',
    (transaction) => transaction.sabor.update({ where: { id: saborId }, data: { activo: false } }),
    () => prisma.sabor.update({ where: { id: saborId }, data: { activo: true } }));
  await verifyConcurrentChange('Presentación deshabilitada', 'FOR SHARE OF sp',
    (transaction) => transaction.saborPresentacion.update({
      where: { saborId_presentacionId: { saborId, presentacionId: medio.id } }, data: { habilitada: false },
    }),
    () => prisma.saborPresentacion.update({
      where: { saborId_presentacionId: { saborId, presentacionId: medio.id } }, data: { habilitada: true },
    }));
  await verifyConcurrentChange('StockObjetivo reemplazado', 'pg_advisory_xact_lock', async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${STOCK_OBJETIVO_LOCK_NAMESPACE}::integer, ${clienteId}::integer)`;
    await transaction.stockObjetivo.delete({ where: {
      clienteId_saborId_presentacionId: { clienteId, saborId, presentacionId: medio.id },
    } });
  }, () => prisma.stockObjetivo.create({ data: { clienteId, saborId, presentacionId: medio.id, cantidad: 6 } }));
  assert.equal(await prisma.registroExistencias.count({ where: { clienteId } }), 1,
    'Los cambios concurrentes rechazados no deben crear snapshots');

  // El trigger solo afecta el cliente temporal y fuerza un fallo después de insertar cabecera y detalles.
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
    BEGIN
      IF NEW."clienteId" = ${clienteId} THEN RAISE EXCEPTION 'Fallo de bitácora de verificación'; END IF;
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`);
  functionCreated = true;
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "MovimientoBitacora"
    FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
  triggerCreated = true;
  assert.equal((await post(allZero)).status, 500, 'El fallo de bitácora debe cancelar el POST');
  assert.equal(await prisma.registroExistencias.count({ where: { clienteId } }), 1, 'No debe persistir la segunda cabecera');
  assert.equal(await prisma.detalleExistencias.count({ where: { registroExistencias: { clienteId } } }), 2, 'No deben persistir detalles del POST fallido');
  assert.equal(await prisma.movimientoBitacora.count({ where: { clienteId } }), 2, 'No debe persistir movimiento fallido');

  await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "MovimientoBitacora"`);
  triggerCreated = false;
  await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
  functionCreated = false;

  assert.equal(await prisma.pedidoProduccion.count({ where: { registroExistenciasId: registro.id } }), 1);
  assert.equal(await prisma.detallePedido.count({ where: { pedidoProduccionId: registro.pedidoProduccion.id } }), 1);
  assert.equal(await prisma.movimientoBitacora.count({ where: { pedidoProduccionId: registro.pedidoProduccion.id } }), 1);
  await assert.rejects(prisma.pedidoProduccion.create({ data: {
    clienteId, repartidorId, registroExistenciasId: registro.id,
  } }), { code: 'P2002' });
  await assert.rejects(prisma.pedidoProduccion.create({ data: {
    clienteId, repartidorId, registroExistenciasId: -1,
  } }), { code: 'P2003' });
  await assert.rejects(prisma.detallePedido.create({ data: {
    pedidoProduccionId: registro.pedidoProduccion.id, saborId, presentacionId: litro.id,
    cantidadSugerida: -1, cantidadSolicitada: 0,
  } }), (error) => { assert.match(String(error), /DetallePedido_cantidadSugerida_check/); return true; });
  await assert.rejects(prisma.detallePedido.create({ data: {
    pedidoProduccionId: registro.pedidoProduccion.id, saborId, presentacionId: litro.id,
    cantidadSugerida: 0, cantidadSolicitada: -1,
  } }), (error) => { assert.match(String(error), /DetallePedido_cantidadSolicitada_check/); return true; });
  await assert.rejects(prisma.detallePedido.create({ data: {
    pedidoProduccionId: registro.pedidoProduccion.id, saborId: -1, presentacionId: litro.id,
    cantidadSugerida: 1, cantidadSolicitada: 1,
  } }), { code: 'P2003' });
  await assert.rejects(prisma.movimientoBitacora.create({ data: {
    clienteId, repartidorId, tipo: 'PEDIDO_PRODUCCION', pedidoProduccionId: -1,
  } }), { code: 'P2003' });
  await assert.rejects(prisma.$executeRaw`
    INSERT INTO "MovimientoBitacora" ("clienteId", "repartidorId", "tipo")
    VALUES (${clienteId}, ${repartidorId}, 'PEDIDO_PRODUCCION'::"TipoMovimiento")
  `, (error) => { assert.match(String(error), /MovimientoBitacora_referencia_check/); return true; });

  const noOrderResponse = await post([item(litro.id, 0), item(medio.id, 6)]);
  assert.equal(noOrderResponse.status, 201);
  const noOrder = await noOrderResponse.json();
  assert.equal(noOrder.requiereProduccion, false);
  assert.equal(noOrder.pedidoProduccion, null);
  assert.equal(await prisma.pedidoProduccion.count({ where: { registroExistenciasId: noOrder.id } }), 0);

  for (const [table, condition] of [
    ['PedidoProduccion', `NEW."clienteId" = ${clienteId}`],
    ['DetallePedido', `NEW."saborId" = ${saborId}`],
    ['MovimientoBitacora', `NEW."clienteId" = ${clienteId} AND NEW."tipo" = 'PEDIDO_PRODUCCION'`],
  ]) {
    const before = {
      registros: await prisma.registroExistencias.count({ where: { clienteId } }),
      pedidos: await prisma.pedidoProduccion.count({ where: { clienteId } }),
      detalles: await prisma.detallePedido.count({ where: { pedidoProduccion: { clienteId } } }),
      movimientos: await prisma.movimientoBitacora.count({ where: { clienteId } }),
    };
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${orderFunctionName}"() RETURNS trigger AS $$
      BEGIN
        IF ${condition} THEN RAISE EXCEPTION 'Fallo de pedido de verificación'; END IF;
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`);
    orderFunctionCreated = true;
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${orderTriggerName}" BEFORE INSERT ON "${table}"
      FOR EACH ROW EXECUTE FUNCTION "${orderFunctionName}"()`);
    orderTriggerTable = table;
    assert.equal((await post(allZero)).status, 500, `${table}: el fallo debe cancelar el POST`);
    assert.deepEqual({
      registros: await prisma.registroExistencias.count({ where: { clienteId } }),
      pedidos: await prisma.pedidoProduccion.count({ where: { clienteId } }),
      detalles: await prisma.detallePedido.count({ where: { pedidoProduccion: { clienteId } } }),
      movimientos: await prisma.movimientoBitacora.count({ where: { clienteId } }),
    }, before, `${table}: snapshot, pedido, detalles y bitácora deben revertirse juntos`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER "${orderTriggerName}" ON "${table}"`);
    orderTriggerTable = undefined;
    await prisma.$executeRawUnsafe(`DROP FUNCTION "${orderFunctionName}"()`);
    orderFunctionCreated = false;
  }

  console.log('Existencias y PedidoProduccion verificados en PostgreSQL real: cálculo, ausencia de pedido vacío, unicidad, FK, CHECK y rollback.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (orderTriggerTable) await prisma.$executeRawUnsafe(`DROP TRIGGER "${orderTriggerName}" ON "${orderTriggerTable}"`);
  if (orderFunctionCreated) await prisma.$executeRawUnsafe(`DROP FUNCTION "${orderFunctionName}"()`);
  if (triggerCreated) await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "MovimientoBitacora"`);
  if (functionCreated) await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
  if (clienteId) {
    await prisma.movimientoBitacora.deleteMany({ where: { clienteId } });
    await prisma.detallePedido.deleteMany({ where: { pedidoProduccion: { clienteId } } });
    await prisma.pedidoProduccion.deleteMany({ where: { clienteId } });
    await prisma.detalleExistencias.deleteMany({ where: { registroExistencias: { clienteId } } });
    await prisma.registroExistencias.deleteMany({ where: { clienteId } });
    await prisma.stockObjetivo.deleteMany({ where: { clienteId } });
    await prisma.visitaCliente.deleteMany({ where: { clienteId } });
  }
  if (otherClienteId) {
    await prisma.visitaCliente.deleteMany({ where: { clienteId: otherClienteId } });
    await prisma.cliente.deleteMany({ where: { id: otherClienteId } });
  }
  if (otherDriverId) await prisma.repartidor.deleteMany({ where: { id: otherDriverId } });
  if (saborId) await prisma.saborPresentacion.deleteMany({ where: { saborId } });
  if (saborId) await prisma.sabor.delete({ where: { id: saborId } });
  if (repartidorId) await prisma.repartidor.delete({ where: { id: repartidorId } });
  if (clienteId) await prisma.cliente.delete({ where: { id: clienteId } });
  await app.close();
}
