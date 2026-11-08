import { Prisma, PrismaClient, TurnoInventarioSucursal } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { StockObjetivoSucursalesService } from '../dist/modules/stock-objetivo-sucursales/stock-objetivo-sucursales.service.js';

/* global process, URL, console */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL requerido');
const parsed = new URL(databaseUrl);
const database = parsed.pathname.replace(/^\//, '').split('/')[0];
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || !database.startsWith('stock_objetivo_sucursales_')) {
  throw new Error('Verificación bloqueada: requiere PostgreSQL local aislado stock_objetivo_sucursales_*');
}

const prisma = new PrismaClient();
const suffix = randomUUID().slice(0, 8);
const branches = [];
const flavors = [];
const reports = [];
const objectiveWhere = (sucursalId) => ({ sucursalId });
const service = new StockObjetivoSucursalesService(prisma, { get: () => 'America/Mexico_City' });
const unrelatedCounts = async () => Promise.all([
  prisma.cliente.count(), prisma.detalleExistencias.count(), prisma.concentradoSucursales.count(),
  prisma.necesidadSucursal.count(), prisma.detalleNecesidadSucursal.count(), prisma.loteYogurtBase.count(),
  prisma.acondicionamientoYogurtBase.count(), prisma.registroExistencias.count(),
  prisma.pedidoProduccion.count(), prisma.detallePedido.count(), prisma.movimientoBitacora.count(),
  prisma.reporteInventarioSucursal.count(), prisma.detalleInventarioSucursal.count(),
  prisma.sucursal.count(), prisma.sabor.count(), prisma.stockObjetivoSucursal.count(),
]);
const baselineUnrelated = await unrelatedCounts();

try {
  await prisma.$connect();
  const [activeBranch, inactiveBranch] = await Promise.all(['Objetivo activo', 'Objetivo inactivo'].map((name) => prisma.sucursal.create({ data: { nombre: `DB ${suffix} ${name}` } })));
  branches.push(activeBranch.id, inactiveBranch.id);
  await prisma.sucursal.update({ where: { id: inactiveBranch.id }, data: { activo: false } });
  const [strawberry, nut, inactiveFlavor, unusedInactiveFlavor] = await Promise.all(['Fresa', 'Nuez', 'Ciruela inactiva', 'Sabor inactivo sin objetivo'].map((name) => prisma.sabor.create({ data: { nombre: `DB ${suffix} ${name}` } })));
  flavors.push(strawberry.id, nut.id, inactiveFlavor.id, unusedInactiveFlavor.id);
  await prisma.sabor.updateMany({ where: { id: { in: [inactiveFlavor.id, unusedInactiveFlavor.id] } }, data: { activo: false } });

  await prisma.stockObjetivoSucursal.create({ data: { sucursalId: activeBranch.id, saborId: strawberry.id, litros: new Prisma.Decimal('0') } });
  await prisma.stockObjetivoSucursal.create({ data: { sucursalId: activeBranch.id, saborId: inactiveFlavor.id, litros: new Prisma.Decimal('2.500') } });
  const configured = await service.get(activeBranch.id);
  if (configured.objetivos.find((item) => item.saborId === strawberry.id)?.litros !== '0' || configured.objetivos.some((item) => item.saborId === nut.id)) throw new Error('Zero and unconfigured objectives were not distinguishable');

  const saved = await service.replace(activeBranch.id, { objetivos: [{ saborId: strawberry.id, litros: '6.125' }, { saborId: inactiveFlavor.id, litros: '2.500' }] });
  if (saved.objetivos.find((item) => item.saborId === strawberry.id)?.litros !== '6.125') throw new Error('Exact Decimal target was not persisted');
  for (const invalid of [
    [{ saborId: strawberry.id, litros: '-1' }, { saborId: inactiveFlavor.id, litros: '2.500' }],
    [{ saborId: strawberry.id, litros: '1.0001' }, { saborId: inactiveFlavor.id, litros: '2.500' }],
    [{ saborId: strawberry.id, litros: '1' }, { saborId: strawberry.id, litros: '2' }, { saborId: inactiveFlavor.id, litros: '2.500' }],
    [{ saborId: strawberry.id, litros: '1' }, { saborId: inactiveFlavor.id, litros: '3' }],
    [{ saborId: strawberry.id, litros: '1' }, { saborId: inactiveFlavor.id, litros: '2.500' }, { saborId: unusedInactiveFlavor.id, litros: '1' }],
    [{ saborId: strawberry.id, litros: '1' }],
    [{ saborId: strawberry.id, litros: '1' }, { saborId: inactiveFlavor.id, litros: '2.500' }, { saborId: unusedInactiveFlavor.id, litros: '1' }],
  ]) {
    let rejected = false;
    try { await service.replace(activeBranch.id, { objetivos: invalid }); } catch { rejected = true; }
    if (!rejected) throw new Error('Invalid, duplicate or inactive-flavor replacement was accepted');
  }
  let inactiveBranchRejected = false;
  try { await service.replace(inactiveBranch.id, { objetivos: [] }); } catch { inactiveBranchRejected = true; }
  if (!inactiveBranchRejected) throw new Error('Inactive branch was writable');
  let unknownReferenceRejected = false;
  try { await service.replace(activeBranch.id, { objetivos: [{ saborId: 2_000_000_000, litros: '1' }, { saborId: inactiveFlavor.id, litros: '2.500' }] }); } catch { unknownReferenceRejected = true; }
  if (!unknownReferenceRejected) throw new Error('Unknown flavor reference was accepted');

  let uniqueRejected = false;
  try { await prisma.stockObjetivoSucursal.create({ data: { sucursalId: activeBranch.id, saborId: strawberry.id, litros: '1' } }); } catch { uniqueRejected = true; }
  if (!uniqueRejected) throw new Error('PostgreSQL composite key allowed a duplicate branch/flavor target');
  let negativeConstraintRejected = false;
  try { await prisma.stockObjetivoSucursal.create({ data: { sucursalId: activeBranch.id, saborId: nut.id, litros: '-0.001' } }); } catch { negativeConstraintRejected = true; }
  if (!negativeConstraintRejected) throw new Error('PostgreSQL CHECK constraint allowed negative liters');
  let foreignKeyRejected = false;
  try { await prisma.stockObjetivoSucursal.create({ data: { sucursalId: activeBranch.id, saborId: 2_000_000_000, litros: '1' } }); } catch { foreignKeyRejected = true; }
  if (!foreignKeyRejected) throw new Error('PostgreSQL foreign key allowed an unknown flavor');

  // Force a failure after the first real write inside the service transaction and verify rollback.
  let upsertCount = 0;
  const failingPrisma = new Proxy(prisma, { get(target, property) {
    if (property !== '$transaction') return Reflect.get(target, property, target);
    return (callback, options) => prisma.$transaction((tx) => callback(new Proxy(tx, { get(transaction, field) {
      if (field !== 'stockObjetivoSucursal') return Reflect.get(transaction, field, transaction);
      return new Proxy(transaction.stockObjetivoSucursal, { get(delegate, method) {
        if (method !== 'upsert') return Reflect.get(delegate, method, delegate);
        return async (args) => {
          upsertCount += 1;
          if (upsertCount === 2) throw new Error('forced test rollback');
          return transaction.stockObjetivoSucursal.upsert(args);
        };
      } });
    } })), options);
  } });
  const failureService = new StockObjetivoSucursalesService(failingPrisma, { get: () => 'America/Mexico_City' });
  let rollbackConfirmed = false;
  try { await failureService.replace(activeBranch.id, { objetivos: [{ saborId: strawberry.id, litros: '7.75' }, { saborId: nut.id, litros: '1.25' }, { saborId: inactiveFlavor.id, litros: '2.500' }] }); }
  catch { rollbackConfirmed = true; }
  const afterRollback = await prisma.stockObjetivoSucursal.findUnique({ where: { sucursalId_saborId: { sucursalId: activeBranch.id, saborId: strawberry.id } } });
  if (!rollbackConfirmed || afterRollback?.litros.toString() !== '6.125' || await prisma.stockObjetivoSucursal.findUnique({ where: { sucursalId_saborId: { sucursalId: activeBranch.id, saborId: nut.id } } })) throw new Error('Failed replacement left partial changes instead of rolling back');

  const concurrent = await Promise.allSettled([
    service.replace(activeBranch.id, { objetivos: [{ saborId: strawberry.id, litros: '3.125' }, { saborId: inactiveFlavor.id, litros: '2.500' }] }),
    service.replace(activeBranch.id, { objetivos: [{ saborId: strawberry.id, litros: '4.250' }, { saborId: inactiveFlavor.id, litros: '2.500' }] }),
  ]);
  if (!concurrent.some((item) => item.status === 'fulfilled')) throw new Error('Concurrent objective replacements both failed');
  const finalObjectives = await prisma.stockObjetivoSucursal.findMany({ where: objectiveWhere(activeBranch.id) });
  const finalStrawberry = finalObjectives.find((item) => item.saborId === strawberry.id)?.litros.toString();
  if (!['3.125', '4.25'].includes(finalStrawberry ?? '') || finalObjectives.filter((item) => item.saborId === strawberry.id).length !== 1 || !finalObjectives.some((item) => item.saborId === inactiveFlavor.id && item.litros.equals('2.5'))) throw new Error('Concurrent serialization left an inconsistent objective set');
  await service.replace(activeBranch.id, { objetivos: [{ saborId: strawberry.id, litros: '3.125' }, { saborId: inactiveFlavor.id, litros: '2.500' }] });

  const confirmed = await prisma.reporteInventarioSucursal.create({ data: {
    sucursalId: activeBranch.id, fecha: new Date('2100-02-03T00:00:00.000Z'), turno: TurnoInventarioSucursal.MATUTINO,
    estado: 'CONFIRMADO', confirmadoAt: new Date('2100-02-03T18:00:00.000Z'),
    detalles: { create: [{ saborId: strawberry.id, litros: new Prisma.Decimal('2.125') }] },
  } });
  reports.push(confirmed.id);
  const morning = await service.compare(activeBranch.id, '2100-02-03', TurnoInventarioSucursal.MATUTINO);
  const strawberryRow = morning.comparaciones.find((item) => item.saborId === strawberry.id);
  const nutRow = morning.comparaciones.find((item) => item.saborId === nut.id);
  if (morning.inventarioEstado !== 'CONFIRMADO' || strawberryRow?.existenciaLitros !== '2.125' || strawberryRow.diferenciaLitros !== '1' || nutRow?.existenciaLitros !== null || nutRow.diferenciaLitros !== null) throw new Error('Confirmed comparison was not exact or treated a missing flavor as zero');
  if ((await service.compare(activeBranch.id, '2100-02-03', TurnoInventarioSucursal.VESPERTINO)).inventarioEstado !== 'AUSENTE') throw new Error('Comparison read inventory from another shift');

  const draft = await prisma.reporteInventarioSucursal.create({ data: {
    sucursalId: activeBranch.id, fecha: new Date('2100-02-04T00:00:00.000Z'), turno: TurnoInventarioSucursal.VESPERTINO,
    detalles: { create: [{ saborId: strawberry.id, litros: new Prisma.Decimal('9') }] },
  } });
  reports.push(draft.id);
  const draftComparison = await service.compare(activeBranch.id, '2100-02-04', TurnoInventarioSucursal.VESPERTINO);
  if (draftComparison.inventarioEstado !== 'BORRADOR' || draftComparison.comparaciones.find((item) => item.saborId === strawberry.id)?.existenciaLitros !== null) throw new Error('Draft snapshot was included in comparison');
  if ((await service.compare(activeBranch.id, '2100-02-05', TurnoInventarioSucursal.MATUTINO)).inventarioEstado !== 'AUSENTE') throw new Error('Missing snapshot was not distinguished');

  const countsBeforeCleanup = await unrelatedCounts();
  if (JSON.stringify(countsBeforeCleanup.slice(0, 11)) !== JSON.stringify(baselineUnrelated.slice(0, 11))) throw new Error('Unrelated module rows changed during verification');
  console.log('PASS: isolated PostgreSQL unique/FK/CHECK constraints, exact Decimal values, explicit zero vs absence, inactive references preserved, atomic rollback, concurrent replacement serialization, and exact confirmed date/shift-only comparison');
} finally {
  await prisma.detalleInventarioSucursal.deleteMany({ where: { reporteId: { in: reports } } });
  await prisma.reporteInventarioSucursal.deleteMany({ where: { id: { in: reports } } });
  if (branches.length) await prisma.stockObjetivoSucursal.deleteMany({ where: { sucursalId: { in: branches } } });
  if (flavors.length) await prisma.stockObjetivoSucursal.deleteMany({ where: { saborId: { in: flavors } } });
  if (branches.length) await prisma.sucursal.deleteMany({ where: { id: { in: branches } } });
  if (flavors.length) await prisma.sabor.deleteMany({ where: { id: { in: flavors } } });
  const afterCleanup = await unrelatedCounts();
  if (JSON.stringify(afterCleanup) !== JSON.stringify(baselineUnrelated)) {
    console.error('FAIL: Unrelated module rows changed after cleanup');
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
