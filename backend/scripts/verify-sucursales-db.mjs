import assert from 'node:assert/strict';
import console from 'node:console';
import { randomInt, randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/db/prisma.service.js';

const database = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['localhost', '127.0.0.1', '::1'].includes(database.hostname), 'El verificador solo permite PostgreSQL local');
assert.match(decodeURIComponent(database.pathname), /^\/unicornio_sucursales_verify_[A-Za-z0-9_-]+$/, 'Usa una base aislada unicornio_sucursales_verify_*');

const app = await NestFactory.create(AppModule, { logger: false });
const prisma = app.get(PrismaService);
const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
const fixture = { sucursalIds: [], saborIds: [], dates: [], triggerName: `verify_sucursales_${suffix}`, functionName: `verify_sucursales_fail_${suffix}` };
let triggerCreated = false;
let functionCreated = false;

const api = async (base, init) => {
  const response = await globalThis.fetch(base, init);
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { status: response.status, body };
};
const jsonInit = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const dbError = (promise, code, description) => assert.rejects(promise, (error) => {
  assert.equal(error.code, code, description);
  return true;
});
const readProtectedCounts = async () => Promise.all([
  prisma.registroExistencias.count(),
  prisma.detalleExistencias.count(),
  prisma.pedidoProduccion.count(),
  prisma.detallePedido.count(),
  prisma.movimientoBitacora.count(),
]);
const dateAt = (offset) => new Date(Date.UTC(2100, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10);
const normalize = (items) => items.map(({ saborId, capacidadLitros, cantidad }) => ({ saborId, capacidadLitros, cantidad }))
  .sort((a, b) => a.saborId - b.saborId || a.capacidadLitros - b.capacidadLitros);

try {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
  const historicalBefore = await readProtectedCounts();
  const baselineActiveSucursalIds = (await prisma.sucursal.findMany({ where: { activo: true }, select: { id: true } })).map(({ id }) => id);
  const date = dateAt(randomInt(0, 900_000));
  const nextDate = dateAt((Date.parse(`${date}T00:00:00Z`) - Date.UTC(2100, 0, 1)) / 86_400_000 + 1);
  fixture.dates.push(date, nextDate);

  const createSucursal = async (nombre) => {
    const result = await api(`${base}/sucursales`, jsonInit('POST', { nombre }));
    assert.equal(result.status, 201, `Crear sucursal ${nombre}`);
    fixture.sucursalIds.push(result.body.id);
    return result.body;
  };
  const branchA = await createSucursal(`Verifier A ${suffix}`);
  const branchB = await createSucursal(`Verifier B ${suffix}`);
  const branchPending = await createSucursal(`Verifier pendiente ${suffix}`);
  const branchRollback = await createSucursal(`Verifier rollback ${suffix}`);
  const branchConcurrent = await createSucursal(`Verifier concurrente ${suffix}`);
  const flavor = await prisma.sabor.create({ data: { nombre: `Verifier sabor ${suffix}` } });
  const zeroFlavor = await prisma.sabor.create({ data: { nombre: `Verifier cero ${suffix}` } });
  const checkFlavor = await prisma.sabor.create({ data: { nombre: `Verifier checks ${suffix}` } });
  fixture.saborIds.push(flavor.id, zeroFlavor.id, checkFlavor.id);

  const detail = (saborId, capacidadLitros, cantidad) => ({ saborId, capacidadLitros, cantidad });
  const firstDetails = [detail(flavor.id, 4, 2), detail(flavor.id, 6, 3), detail(flavor.id, 10, 4)];
  const updatedDetails = [detail(flavor.id, 4, 5), detail(flavor.id, 6, 3), detail(flavor.id, 10, 4)];
  const save = (sucursalId, fecha, detalles) => api(`${base}/sucursales/${sucursalId}/necesidades`, jsonInit('PUT', { fecha, detalles }));
  const confirm = (sucursalId, fecha) => api(`${base}/sucursales/${sucursalId}/necesidades/confirmacion?fecha=${encodeURIComponent(fecha)}`, { method: 'POST' });
  const report = (fecha) => api(`${base}/concentrado-sucursales?fecha=${encodeURIComponent(fecha)}`);

  assert.equal((await save(branchA.id, date, firstDetails)).status, 200, 'Guardar borrador con cubetas 4/6/10 L');
  const firstNeed = await prisma.necesidadSucursal.findUniqueOrThrow({ where: { concentradoId_sucursalId: {
    concentradoId: (await prisma.concentradoSucursales.findUniqueOrThrow({ where: { fecha: new Date(`${date}T00:00:00.000Z`) } })).id,
    sucursalId: branchA.id,
  } } });
  assert.equal((await save(branchA.id, date, updatedDetails)).status, 200, 'El borrador debe poder editarse');
  assert.deepEqual(normalize(await prisma.detalleNecesidadSucursal.findMany({ where: { necesidadSucursalId: firstNeed.id } })), normalize(updatedDetails));
  assert.equal((await save(branchB.id, date, [detail(zeroFlavor.id, 4, 0)])).status, 200, 'Cantidad cero explícita válida');

  const invalidNegative = await save(branchPending.id, date, [detail(flavor.id, 4, -1)]);
  assert.equal(invalidNegative.status, 400, 'La API rechaza cantidades negativas');
  const invalidDecimal = await save(branchPending.id, date, [detail(flavor.id, 4, 1.5)]);
  assert.equal(invalidDecimal.status, 400, 'La API rechaza cantidades decimales');
  const invalidCapacity = await save(branchPending.id, date, [detail(flavor.id, 5, 1)]);
  assert.equal(invalidCapacity.status, 400, 'La API rechaza capacidades fuera de 4/6/10');
  const duplicateCombination = await save(branchPending.id, date, [detail(flavor.id, 4, 1), detail(flavor.id, 4, 2)]);
  assert.equal(duplicateCombination.status, 400, 'La API rechaza combinaciones duplicadas');

  let data = await report(date);
  assert.equal(data.status, 200);
  assert.deepEqual(data.body.sucursales, [], 'Los borradores no se incluyen como confirmados');
  assert.deepEqual(data.body.consolidado, [], 'Borrador/ausencia no equivalen a necesidad cero');
  assert.deepEqual(new Set(data.body.sucursalesSinConfirmar.map(({ id }) => id)), new Set([...baselineActiveSucursalIds, ...fixture.sucursalIds]));

  // PostgreSQL uniqueness and FK constraints are exercised directly, independently of DTO validation.
  const concentration = await prisma.concentradoSucursales.findUniqueOrThrow({ where: { fecha: new Date(`${date}T00:00:00.000Z`) } });
  await dbError(prisma.concentradoSucursales.create({ data: { fecha: new Date(`${date}T00:00:00.000Z`) } }), 'P2002', 'Unique concentration date');
  await dbError(prisma.necesidadSucursal.create({ data: { concentradoId: concentration.id, sucursalId: branchA.id } }), 'P2002', 'Unique branch/date report');
  await dbError(prisma.necesidadSucursal.create({ data: { concentradoId: concentration.id, sucursalId: 2_147_483_647 } }), 'P2003', 'Sucursal FK');
  await dbError(prisma.detalleNecesidadSucursal.create({ data: { necesidadSucursalId: firstNeed.id, saborId: flavor.id, capacidadLitros: 4, cantidad: 1 } }), 'P2002', 'Unique flavor/capacity within report');
  await dbError(prisma.detalleNecesidadSucursal.create({ data: { necesidadSucursalId: firstNeed.id, saborId: 2_147_483_647, capacidadLitros: 4, cantidad: 1 } }), 'P2003', 'Sabor FK');
  const branchBNeed = await prisma.necesidadSucursal.findUniqueOrThrow({ where: { concentradoId_sucursalId: { concentradoId: concentration.id, sucursalId: branchB.id } } });
  await assert.rejects(prisma.detalleNecesidadSucursal.create({ data: { necesidadSucursalId: branchBNeed.id, saborId: checkFlavor.id, capacidadLitros: 5, cantidad: 1 } }),
    (error) => error.message.includes("DetalleNecesidadSucursal_capacidad_check"));
  await assert.rejects(prisma.detalleNecesidadSucursal.create({ data: { necesidadSucursalId: branchBNeed.id, saborId: checkFlavor.id, capacidadLitros: 4, cantidad: -1 } }),
    (error) => error.message.includes("DetalleNecesidadSucursal_cantidad_check"));

  assert.equal((await confirm(branchA.id, date)).status, 201, 'Confirmar el borrador');
  data = (await report(date)).body;
  assert.equal(data.sucursales.length, 1);
  assert.equal(data.sucursales[0].sucursalId, branchA.id);
  assert.deepEqual(data.sucursales[0].detalles.map(({ capacidadLitros, cantidad, litrosEquivalentes }) => [capacidadLitros, cantidad, litrosEquivalentes]), [[4, 5, 20], [6, 3, 18], [10, 4, 40]]);
  assert.equal(data.consolidado.reduce((sum, item) => sum + item.litrosEquivalentes, 0), 78, 'Conversión de cubetas a litros equivalentes');
  assert.deepEqual(new Set(data.sucursalesSinConfirmar.map(({ id }) => id)), new Set([...baselineActiveSucursalIds, branchB.id, branchPending.id, branchRollback.id, branchConcurrent.id]));

  assert.equal((await confirm(branchB.id, date)).status, 201, 'Confirmar una necesidad explícita en cero');
  const zero = (await report(date)).body;
  assert.deepEqual(zero.sucursalesSinConfirmar.map(({ id }) => id), [...baselineActiveSucursalIds, branchPending.id, branchRollback.id, branchConcurrent.id].sort((a, b) => a - b), 'Sucursal sin reporte sigue pendiente, no en cero');
  const zeroLine = zero.consolidado.find((item) => item.saborId === zeroFlavor.id && item.capacidadLitros === 4);
  assert.ok(zeroLine, 'Una necesidad confirmada con cero permanece en el consolidado');
  assert.deepEqual([zeroLine.cantidad, zeroLine.litrosEquivalentes], [0, 0]);
  assert.equal((await save(branchA.id, date, firstDetails)).status, 409, 'Un reporte confirmado es inmutable');
  assert.equal((await confirm(branchA.id, date)).status, 409, 'No se confirma dos veces');

  assert.equal((await save(branchPending.id, nextDate, [detail(flavor.id, 10, 1)])).status, 200, 'Mismo branch en otra fecha genera otro reporte');
  assert.equal(await prisma.concentradoSucursales.count({ where: { fecha: { in: fixture.dates.map((value) => new Date(`${value}T00:00:00.000Z`)) } } }), 2,
    'Una cabecera por fecha, con necesidades independientes por sucursal');

  // Real rollback: trigger fails after DELETE inside the service transaction; prior draft rows must survive.
  assert.equal((await save(branchRollback.id, nextDate, [detail(flavor.id, 4, 1)])).status, 200, 'Crear borrador temporal para rollback');
  const rollbackNeed = await prisma.necesidadSucursal.findUniqueOrThrow({ where: { concentradoId_sucursalId: {
    concentradoId: (await prisma.concentradoSucursales.findUniqueOrThrow({ where: { fecha: new Date(`${nextDate}T00:00:00.000Z`) } })).id,
    sucursalId: branchRollback.id,
  } } });
  const rollbackBefore = normalize(await prisma.detalleNecesidadSucursal.findMany({ where: { necesidadSucursalId: rollbackNeed.id } }));
  const functionName = fixture.functionName;
  const triggerName = fixture.triggerName;
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $verify$ BEGIN RAISE EXCEPTION 'forced rollback verification'; END; $verify$`);
  functionCreated = true;
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "DetalleNecesidadSucursal" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
  triggerCreated = true;
  const rollbackResponse = await save(branchRollback.id, nextDate, [detail(flavor.id, 4, 9)]);
  assert.equal(rollbackResponse.status, 500, 'El trigger debe hacer fallar la operación dentro de PostgreSQL');
  await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "DetalleNecesidadSucursal"`);
  triggerCreated = false;
  await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
  functionCreated = false;
  assert.deepEqual(normalize(await prisma.detalleNecesidadSucursal.findMany({ where: { necesidadSucursalId: rollbackNeed.id } })), rollbackBefore,
    'Rollback conserva íntegro el borrador previo tras DELETE + fallo de INSERT');
  assert.equal((await prisma.necesidadSucursal.findUniqueOrThrow({ where: { id: rollbackNeed.id } })).estado, 'BORRADOR');

  // Deterministic save-vs-confirm race: hold the report row, observe confirm blocked on it, save while blocked, then release.
  assert.equal((await save(branchConcurrent.id, nextDate, [detail(flavor.id, 6, 2)])).status, 200);
  const concurrentNeed = await prisma.necesidadSucursal.findUniqueOrThrow({ where: { concentradoId_sucursalId: {
    concentradoId: (await prisma.concentradoSucursales.findUniqueOrThrow({ where: { fecha: new Date(`${nextDate}T00:00:00.000Z`) } })).id,
    sucursalId: branchConcurrent.id,
  } } });
  const oldConcurrentDetails = [detail(flavor.id, 6, 2)];
  const newConcurrentDetails = [detail(flavor.id, 6, 7)];
  let signalReady;
  let rejectReady;
  let releaseBlocker;
  const blockerReady = new Promise((resolve, reject) => { signalReady = resolve; rejectReady = reject; });
  const blocked = new Promise((resolve) => { releaseBlocker = resolve; });
  const blocker = prisma.$transaction(async (tx) => {
    const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid()::integer AS pid`;
    await tx.$queryRaw`SELECT "id" FROM "NecesidadSucursal" WHERE "id" = ${concurrentNeed.id} FOR UPDATE`;
    signalReady(pid);
    await blocked;
  }, { timeout: 20_000 });
  void blocker.catch(rejectReady);
  let confirmSettled = false;
  let confirmPromise;
  let savePromise;
  let saveResult;
  let confirmResult;
  try {
    const blockerPid = await blockerReady;
    confirmPromise = confirm(branchConcurrent.id, nextDate).then((result) => { confirmSettled = true; return result; });
    const deadline = Date.now() + 10_000;
    let observed = false;
    while (Date.now() < deadline) {
      assert.equal(confirmSettled, false, 'Confirmar no debe terminar mientras el lock externo está retenido');
      const waiting = await prisma.$queryRaw`
        SELECT query, pg_blocking_pids(pid) AS blockers
        FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()
      `;
      if (waiting.some((row) => row.blockers.includes(blockerPid) && row.query.includes('NecesidadSucursal'))) { observed = true; break; }
      await delay(10);
    }
    assert.ok(observed, 'PostgreSQL debe mostrar el POST de confirmación esperando el lock retenido');
    assert.equal(confirmSettled, false);
    savePromise = save(branchConcurrent.id, nextDate, newConcurrentDetails);
    let bothWaiting = false;
    while (Date.now() < deadline) {
      const [{ count }] = await prisma.$queryRaw`SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid() AND query LIKE '%NecesidadSucursal%'`;
      if (count >= 2) { bothWaiting = true; break; }
      await delay(10);
    }
    assert.ok(bothWaiting, 'PostgreSQL debe mostrar ambas peticiones esperando el row lock');
    assert.equal(confirmSettled, false, 'Confirmación no debe terminar mientras espera al guardado concurrente');
  } finally {
    releaseBlocker();
    await blocker;
    if (confirmPromise) confirmResult = await confirmPromise;
    if (savePromise) saveResult = await savePromise;
  }
  assert.ok([200, 409].includes(saveResult.status), `Guardar concurrente terminó con ${saveResult.status}`);
  assert.ok([201, 409].includes(confirmResult.status), `Confirmar concurrente terminó con ${confirmResult.status}`);
  const finalNeed = await prisma.necesidadSucursal.findUniqueOrThrow({ where: { id: concurrentNeed.id } });
  const finalDetails = normalize(await prisma.detalleNecesidadSucursal.findMany({ where: { necesidadSucursalId: concurrentNeed.id } }));
  const expectedConcurrentDetails = saveResult.status === 200 ? newConcurrentDetails : oldConcurrentDetails;
  assert.deepEqual(finalDetails, normalize(expectedConcurrentDetails), 'El estado final debe corresponder a una operación serializada, sin pérdida ni mezcla de líneas');
  if (finalNeed.estado === 'CONFIRMADO') assert.equal(confirmResult.status, 201);
  else assert.equal(confirmResult.status, 409, 'Si no confirmó, la operación debe señalar conflicto');

  assert.deepEqual(await readProtectedCounts(), historicalBefore, 'El slice no modifica registros, pedidos ni bitácora de existencias');
  console.log('Sucursales verificado en PostgreSQL local aislado: 4/6/10 L, borradores/confirmación, consolidado, cero vs pendiente, FK/UNIQUE/CHECK, rollback y concurrencia guardar-confirmar.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    if (triggerCreated) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${fixture.triggerName}" ON "DetalleNecesidadSucursal"`);
    if (functionCreated) await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fixture.functionName}"()`);
    if (fixture.sucursalIds.length) {
      const needs = await prisma.necesidadSucursal.findMany({ where: { sucursalId: { in: fixture.sucursalIds } }, select: { id: true } });
      const needIds = needs.map(({ id }) => id);
      if (needIds.length) {
        await prisma.detalleNecesidadSucursal.deleteMany({ where: { necesidadSucursalId: { in: needIds } } });
        await prisma.necesidadSucursal.deleteMany({ where: { id: { in: needIds } } });
      }
      if (fixture.dates.length) {
        const dates = fixture.dates.map((value) => new Date(`${value}T00:00:00.000Z`));
        const concentrations = await prisma.concentradoSucursales.findMany({ where: { fecha: { in: dates } }, select: { id: true } });
        await prisma.concentradoSucursales.deleteMany({ where: { id: { in: concentrations.map(({ id }) => id) } } });
      }
      await prisma.sucursal.deleteMany({ where: { id: { in: fixture.sucursalIds } } });
    }
    if (fixture.saborIds.length) await prisma.sabor.deleteMany({ where: { id: { in: fixture.saborIds } } });
  } catch (error) {
    console.error('Fixture cleanup failed:', error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}
