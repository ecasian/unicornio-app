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
let triggerCreated = false;
let functionCreated = false;

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
  const item = (presentacionId, cantidad) => ({ saborId, presentacionId, cantidad });
  const post = (existencias) => globalThis.fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repartidorId, existencias }) });
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
  assert.equal((await post([...allZero, item(litro.id, 1)])).status, 400, 'Combinación extra');
  assert.equal((await post([item(litro.id, 1), item(litro.id, 2)])).status, 400, 'Duplicado');
  const created = await post(allZero);
  assert.equal(created.status, 201);
  const registro = await created.json();
  assert.deepEqual(registro.detalles.map((detail) => detail.cantidad), [0, 0]);
  assert.equal(registro.movimiento.tipo, 'REGISTRO_EXISTENCIAS');
  assert.equal((await globalThis.fetch(`${base}/${registro.id}`)).status, 200);
  assert.equal(await prisma.detalleExistencias.count({ where: { registroExistenciasId: registro.id } }), 2);
  assert.equal(await prisma.movimientoBitacora.count({ where: { registroExistenciasId: registro.id } }), 1);

  await assert.rejects(prisma.detalleExistencias.create({ data: {
    registroExistenciasId: registro.id, ...item(litro.id, 1),
  } }), { code: 'P2002' });
  // Cabecera distinta: la inserción no puede fallar por la PK compuesta anterior.
  const registroCheck = await prisma.registroExistencias.create({ data: { clienteId, repartidorId } });
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
  assert.equal(await prisma.movimientoBitacora.count({ where: { clienteId } }), 1, 'No debe persistir movimiento fallido');

  console.log('RegistroExistencias verificado en PostgreSQL real: snapshot completo, ceros, bitácora, unicidad, checks y rollback.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (triggerCreated) await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "MovimientoBitacora"`);
  if (functionCreated) await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
  if (clienteId) {
    await prisma.movimientoBitacora.deleteMany({ where: { clienteId } });
    await prisma.detalleExistencias.deleteMany({ where: { registroExistencias: { clienteId } } });
    await prisma.registroExistencias.deleteMany({ where: { clienteId } });
    await prisma.stockObjetivo.deleteMany({ where: { clienteId } });
  }
  if (saborId) await prisma.saborPresentacion.deleteMany({ where: { saborId } });
  if (saborId) await prisma.sabor.delete({ where: { id: saborId } });
  if (repartidorId) await prisma.repartidor.delete({ where: { id: repartidorId } });
  if (clienteId) await prisma.cliente.delete({ where: { id: clienteId } });
  await app.close();
}
