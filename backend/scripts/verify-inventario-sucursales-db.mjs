import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { InventarioSucursalesService } from '../dist/modules/inventario-sucursales/inventario-sucursales.service.js';

/* global process, URL, console */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL requerido');
const parsed = new URL(databaseUrl);
const database = parsed.pathname.replace(/^\//, '').split('/')[0];
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || !database.startsWith('unicornio_inventario_sucursales_')) {
  throw new Error('Verificación bloqueada: requiere PostgreSQL local aislado unicornio_inventario_sucursales_*');
}

const prisma = new PrismaClient();
const suffix = randomUUID().slice(0, 8);
const fecha = '2100-01-02';
const matutino = 'MATUTINO';
const vespertino = 'VESPERTINO';
const branchIds = [];
const flavorIds = [];
const reportIds = [];
const service = new InventarioSucursalesService(prisma, { get: () => 'America/Mexico_City' });

try {
  await prisma.$connect();
  const [centro, norte, sur, concurrente] = await Promise.all(['Centro', 'Norte', 'Sur', 'Concurrencia'].map((name) => prisma.sucursal.create({ data: { nombre: `DB ${suffix} ${name}` } })));
  branchIds.push(centro.id, norte.id, sur.id, concurrente.id);
  const [fresa, nuez] = await Promise.all(['Fresa', 'Nuez'].map((name) => prisma.sabor.create({ data: { nombre: `DB ${suffix} ${name}` } })));
  flavorIds.push(fresa.id, nuez.id);

  const legacy = await prisma.reporteInventarioSucursal.create({ data: { sucursalId: centro.id, fecha: new Date('2100-01-01T00:00:00Z'), turno: null, estado: 'CONFIRMADO', confirmadoAt: new Date('2100-01-01T20:00:00Z') } });
  reportIds.push(legacy.id);
  await prisma.detalleInventarioSucursal.create({ data: { reporteId: legacy.id, saborId: fresa.id, litros: '3.125' } });

  const first = await service.guardar({ fecha, sucursalId: centro.id, turno: matutino, detalles: [{ saborId: fresa.id, litros: '0' }, { saborId: nuez.id, litros: '2.5' }] });
  reportIds.push(first.id);
  const edited = await service.guardar({ fecha, sucursalId: centro.id, turno: matutino, detalles: [{ saborId: fresa.id, litros: '0.000' }, { saborId: nuez.id, litros: '2.500' }] });
  if (edited.id !== first.id) throw new Error('Draft update created a second report for the same branch/date');
  if (edited.detalles.find((item) => item.saborId === fresa.id)?.litros !== '0') throw new Error('Explicit zero was not preserved');
  if (edited.detalles.find((item) => item.saborId === nuez.id)?.litros !== '2.5') throw new Error('Exact decimal was not preserved');

  const evening = await service.guardar({ fecha, sucursalId: centro.id, turno: vespertino, detalles: [{ saborId: fresa.id, litros: '4.25' }] });
  reportIds.push(evening.id);
  if (evening.id === first.id || evening.turno !== vespertino) throw new Error('Matutino and vespertino did not create independent snapshots');
  let duplicateShiftRejected = false;
  try { await prisma.reporteInventarioSucursal.create({ data: { fecha: new Date(`${fecha}T00:00:00Z`), sucursalId: centro.id, turno: matutino } }); }
  catch { duplicateShiftRejected = true; }
  if (!duplicateShiftRejected) throw new Error('PostgreSQL unique key allowed duplicate branch/date/shift reports');

  let duplicateRejected = false;
  try { await service.guardar({ fecha, sucursalId: centro.id, turno: matutino, detalles: [{ saborId: fresa.id, litros: '1' }, { saborId: fresa.id, litros: '2' }] }); }
  catch { duplicateRejected = true; }
  if (!duplicateRejected) throw new Error('Duplicate flavor rows were accepted');
  let negativeRejected = false;
  try { await service.guardar({ fecha, sucursalId: centro.id, turno: matutino, detalles: [{ saborId: fresa.id, litros: '-0.5' }] }); }
  catch { negativeRejected = true; }
  if (!negativeRejected) throw new Error('Negative liters were accepted');

  const northDraft = await service.guardar({ fecha, sucursalId: norte.id, turno: matutino, detalles: [{ saborId: fresa.id, litros: '6.5' }] });
  reportIds.push(northDraft.id);
  const southDraft = await service.guardar({ fecha, sucursalId: sur.id, turno: matutino, detalles: [{ saborId: fresa.id, litros: '0.5' }] });
  reportIds.push(southDraft.id);
  const emptyDraft = await service.guardar({ fecha: '2100-01-07', sucursalId: sur.id, turno: matutino, detalles: [] });
  reportIds.push(emptyDraft.id);
  let emptyConfirmationRejected = false;
  try { await service.confirmar(emptyDraft.id); }
  catch { emptyConfirmationRejected = true; }
  if (!emptyConfirmationRejected) throw new Error('An empty draft was confirmed without an explicit flavor quantity');
  await service.confirmar(first.id);
  await service.confirmar(evening.id);
  await service.confirmar(northDraft.id);
  let locked = false;
  try { await service.guardar({ fecha, sucursalId: centro.id, turno: matutino, detalles: [{ saborId: nuez.id, litros: '99' }] }); }
  catch { locked = true; }
  if (!locked) throw new Error('Confirmed report was editable');
  let confirmReplayRejected = false;
  try { await service.confirmar(first.id); }
  catch { confirmReplayRejected = true; }
  if (!confirmReplayRejected) throw new Error('Repeated confirmation was accepted');

  const result = await service.consultar(fecha, matutino);
  const eveningResult = await service.consultar(fecha, vespertino);
  if (eveningResult.consolidado.find((item) => item.saborId === fresa.id)?.litros !== '4.25' || eveningResult.sucursales.some((item) => item.turno !== vespertino)) throw new Error('Evening summary was mixed with another shift');
  if (result.sucursales.some((item) => item.turno !== matutino) || result.consolidado.some((item) => item.litros === '10.75')) throw new Error('Morning summary includes evening inventory');
  if (result.historicosAnterioresSinTurno.find((item) => item.sucursalId === centro.id)?.reporte.id !== legacy.id) throw new Error('Legacy report without shift was not exposed separately');
  if (result.ultimoInventarioConfirmadoPorSucursal.find((item) => item.sucursalId === centro.id)?.reporte?.id !== first.id || eveningResult.ultimoInventarioConfirmadoPorSucursal.find((item) => item.sucursalId === centro.id)?.reporte?.id !== evening.id) throw new Error('Latest confirmed report was not scoped to its shift/date');
  const fresaTotal = result.consolidado.find((item) => item.saborId === fresa.id)?.litros;
  const nuezTotal = result.consolidado.find((item) => item.saborId === nuez.id)?.litros;
  if (fresaTotal !== '6.5' || nuezTotal !== '2.5') throw new Error(`Drafts/zeros were mishandled in exact consolidated totals: ${fresaTotal}, ${nuezTotal}`);
  if (!result.sucursalesPendientes.some((item) => item.id === sur.id)) throw new Error('Unconfirmed branch was not reported pending');
  if (result.sucursales.some((item) => item.sucursalId === sur.id)) throw new Error('Unconfirmed draft appeared in the confirmed summary');
  if (result.sucursales.find((item) => item.sucursalId === centro.id)?.detalles.length !== 2) throw new Error('Absent flavors were synthesized or explicit rows lost');
  if (result.sucursales.find((item) => item.sucursalId === norte.id)?.detalles.some((item) => item.saborId === nuez.id)) throw new Error('An absent flavor was synthesized as an implicit zero');

  let negativeConstraintRejected = false;
  try { await prisma.detalleInventarioSucursal.create({ data: { reporteId: southDraft.id, saborId: nuez.id, litros: '-0.001' } }); }
  catch { negativeConstraintRejected = true; }
  if (!negativeConstraintRejected) throw new Error('PostgreSQL accepted negative liters');

  const otherDate = await service.guardar({ fecha: '2100-01-03', sucursalId: centro.id, turno: matutino, detalles: [{ saborId: nuez.id, litros: '1.5' }] });
  reportIds.push(otherDate.id);
  if (await prisma.reporteInventarioSucursal.count({ where: { sucursalId: centro.id } }) !== 4) throw new Error('Historical report for another date was not preserved');

  const rollbackDate = new Date('2100-01-04T00:00:00.000Z');
  let rollbackTriggered = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.reporteInventarioSucursal.create({ data: { sucursalId: sur.id, fecha: rollbackDate, turno: matutino } });
      throw new Error('force rollback');
    });
  } catch { rollbackTriggered = true; }
  if (!rollbackTriggered || await prisma.reporteInventarioSucursal.count({ where: { sucursalId: sur.id, fecha: rollbackDate, turno: matutino } }) !== 0) throw new Error('PostgreSQL transaction rollback failed');

  const serviceRollbackDate = '2100-01-08';
  let serviceRollbackTriggered = false;
  try { await service.guardar({ fecha: serviceRollbackDate, sucursalId: sur.id, turno: matutino, detalles: [{ saborId: nuez.id, litros: '100000000000' }] }); }
  catch { serviceRollbackTriggered = true; }
  if (!serviceRollbackTriggered || await prisma.reporteInventarioSucursal.count({ where: { sucursalId: sur.id, fecha: new Date(`${serviceRollbackDate}T00:00:00Z`), turno: matutino } }) !== 0) {
    throw new Error('Failed detail insert left a partial report instead of rolling back the service transaction');
  }

  const race = await Promise.allSettled([
    service.guardar({ fecha: '2100-01-05', sucursalId: concurrente.id, turno: matutino, detalles: [{ saborId: fresa.id, litros: '1' }] }),
    service.guardar({ fecha: '2100-01-05', sucursalId: concurrente.id, turno: matutino, detalles: [{ saborId: fresa.id, litros: '2' }] }),
  ]);
  const concurrentReport = await prisma.reporteInventarioSucursal.findUnique({ where: { sucursalId_fecha_turno: { fecha: new Date('2100-01-05T00:00:00Z'), sucursalId: concurrente.id, turno: matutino } } });
  if (!concurrentReport || race.filter((item) => item.status === 'fulfilled').length < 1) throw new Error('Concurrent draft creation did not leave a valid unique report');
  reportIds.push(concurrentReport.id);
  const duplicateCount = await prisma.reporteInventarioSucursal.count({ where: { fecha: new Date('2100-01-05T00:00:00Z'), sucursalId: concurrente.id, turno: matutino } });
  if (duplicateCount !== 1) throw new Error('Concurrent requests produced duplicate reports');

  const raceDraft = await service.guardar({ fecha: '2100-01-06', sucursalId: concurrente.id, turno: matutino, detalles: [{ saborId: fresa.id, litros: '0.5' }] });
  reportIds.push(raceDraft.id);
  const raceResult = await Promise.allSettled([
    service.guardar({ fecha: '2100-01-06', sucursalId: concurrente.id, turno: matutino, detalles: [{ saborId: fresa.id, litros: '1.5' }] }),
    service.confirmar(raceDraft.id),
  ]);
  if (raceResult.every((item) => item.status === 'rejected')) throw new Error('Concurrent draft edit and confirmation both failed');
  let finalReport = await prisma.reporteInventarioSucursal.findUnique({ where: { id: raceDraft.id }, include: { detalles: true } });
  if (finalReport?.estado !== 'CONFIRMADO') {
    await service.confirmar(raceDraft.id);
    finalReport = await prisma.reporteInventarioSucursal.findUnique({ where: { id: raceDraft.id }, include: { detalles: true } });
  }
  if (finalReport?.estado !== 'CONFIRMADO' || finalReport.detalles.length !== 1) throw new Error('Concurrent confirmation did not preserve one coherent snapshot');
  let postRaceEditRejected = false;
  try { await service.guardar({ fecha: '2100-01-06', sucursalId: concurrente.id, turno: matutino, detalles: [{ saborId: fresa.id, litros: '9' }] }); }
  catch { postRaceEditRejected = true; }
  if (!postRaceEditRejected) throw new Error('Concurrent confirmation allowed a later edit');

  console.log('PASS: PostgreSQL exact Decimal values, explicit zeros, duplicate/negative validation, unique branch/date/shift, independent shifts, editable drafts, immutable confirmation, confirmed-only consolidation, pending branches, absent flavor distinction, history, row-lock concurrency and transaction rollback');
} finally {
  await prisma.detalleInventarioSucursal.deleteMany({ where: { reporteId: { in: reportIds } } });
  await prisma.reporteInventarioSucursal.deleteMany({ where: { id: { in: reportIds } } });
  await prisma.sucursal.deleteMany({ where: { id: { in: branchIds } } });
  await prisma.sabor.deleteMany({ where: { id: { in: flavorIds } } });
  await prisma.$disconnect();
}
