import { PrismaClient } from '@prisma/client';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { YogurtBaseService } from '../dist/modules/yogurt-base/yogurt-base.service.js';

/* global process, URL, console */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL requerido');
const parsed = new URL(databaseUrl);
const database = parsed.pathname.replace(/^\//, '').split('/')[0];
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || !database.startsWith('unicornio_sucursales_verify_')) {
  throw new Error('Verificación bloqueada: requiere PostgreSQL local aislado unicornio_sucursales_verify_*');
}

const prisma = new PrismaClient();
const suffix = `verify-yogurtbase-${Date.now()}`;
let saborId;
let lotId;
try {
  await prisma.$connect();
  const sabor = await prisma.sabor.create({ data: { nombre: `DB ${suffix}` } });
  saborId = sabor.id;
  const service = new YogurtBaseService(prisma, { get: () => 'America/Mexico_City' });
  const lot = await prisma.loteYogurtBase.create({ data: { fechaElaboracion: new Date('2100-01-01'), cubetas10L: 1, cubetas6L: 1, cubetas4L: 1, litrosReales: '20.000' } });
  lotId = lot.id;

  const idempotencyKey = randomUUID();
  const first = await prisma.acondicionamientoYogurtBase.create({ data: { loteId: lotId, saborId, claveSolicitud: idempotencyKey, litrosConsumidos: '7.500', litrosObtenidos: '7.200' } });
  const retried = await prisma.acondicionamientoYogurtBase.findUnique({ where: { claveSolicitud: idempotencyKey } });
  if (first.id !== retried?.id) throw new Error('Idempotency key did not preserve the original movement');

  let constraintRejected = false;
  try { await prisma.loteYogurtBase.create({ data: { fechaElaboracion: new Date('2100-01-02'), cubetas10L: -1, cubetas6L: 0, cubetas4L: 0, litrosReales: '1' } }); }
  catch { constraintRejected = true; }
  if (!constraintRejected) throw new Error('PostgreSQL accepted a negative bucket count');

  let rollbackWorked = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.acondicionamientoYogurtBase.create({ data: { loteId: lotId, saborId, claveSolicitud: randomUUID(), litrosConsumidos: '1', litrosObtenidos: '1' } });
      throw new Error('force rollback');
    });
  } catch { rollbackWorked = true; }
  const rolledBack = await prisma.acondicionamientoYogurtBase.count({ where: { loteId: lotId, litrosConsumidos: '1' } });
  if (!rollbackWorked || rolledBack !== 0) throw new Error('Transaction rollback failed');

  const consume = (key) => prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "LoteYogurtBase" WHERE "id" = ${lotId} FOR UPDATE`;
    const rows = await tx.acondicionamientoYogurtBase.aggregate({ where: { loteId: lotId }, _sum: { litrosConsumidos: true } });
    const current = Number(rows._sum.litrosConsumidos ?? 0);
    if (current + 8 > 20) throw new Error('overprocessed');
    await delay(80);
    return tx.acondicionamientoYogurtBase.create({ data: { loteId: lotId, saborId, claveSolicitud: key, litrosConsumidos: '8', litrosObtenidos: '8.2' } });
  }, { isolationLevel: 'ReadCommitted' });
  const concurrent = await Promise.allSettled([
    consume(randomUUID()),
    consume(randomUUID()),
  ]);
  const succeeded = concurrent.filter((item) => item.status === 'fulfilled').length;
  if (succeeded !== 1) throw new Error(`Expected one concurrent consume to succeed, got ${succeeded}`);
  const totals = await prisma.acondicionamientoYogurtBase.aggregate({ where: { loteId: lotId }, _sum: { litrosConsumidos: true } });
  if (Number(totals._sum.litrosConsumidos) !== 15.5) throw new Error(`Unexpected consumed total: ${totals._sum.litrosConsumidos}`);

  let immutable = false;
  try { await prisma.loteYogurtBase.delete({ where: { id: lotId } }); }
  catch { immutable = true; }
  if (!immutable) throw new Error('PostgreSQL allowed deleting a lot with movements');

  const natural = await prisma.sabor.create({ data: { nombre: `Natural ${suffix}` } });
  const ageLot = await service.createLot({ fechaElaboracion: '2100-01-06', cubetas10L: 1, cubetas6L: 0, cubetas4L: 0, litrosReales: 10 });
  for (const [date, days, state, priority, review] of [
    ['2100-01-06', 0, 'PROCESAMIENTO_NORMAL', false, false],
    ['2100-01-07', 1, 'PROCESAMIENTO_NORMAL', false, false],
    ['2100-01-08', 2, 'PROCESAMIENTO_OBLIGATORIO', true, false],
    ['2100-01-09', 3, 'LIMITE_EXCEDIDO_REQUIERE_REVISION', false, true],
  ]) {
    const row = (await service.list(date)).lotes.find((item) => item.id === ageLot.id);
    if (row?.edadCalendarioDias !== days || row.estadoTemporal !== state || row.alertaPrioritaria !== priority || row.requiereRevisionPorLimite !== review) throw new Error(`Wrong business age state for ${date}: ${JSON.stringify(row)}`);
  }
  await prisma.loteYogurtBase.delete({ where: { id: ageLot.id } });
  const serviceLot = await service.createLot({ fechaElaboracion: '2100-01-03', cubetas10L: 2, cubetas6L: 0, cubetas4L: 0, litrosReales: 20 });
  const requestKey = randomUUID();
  const savedMove = await service.condition({ loteId: serviceLot.id, saborId, claveSolicitud: requestKey, litrosConsumidos: 6, litrosObtenidos: 5.8 });
  const retriedMove = await service.condition({ loteId: serviceLot.id, saborId, claveSolicitud: requestKey, litrosConsumidos: 6, litrosObtenidos: 5.8 });
  if (savedMove.id !== retriedMove.id) throw new Error('Service retry created a duplicate movement');
  await service.condition({ loteId: serviceLot.id, saborId, claveSolicitud: randomUUID(), litrosConsumidos: 14, litrosObtenidos: 15 });
  let overprocessRejected = false;
  try { await service.condition({ loteId: serviceLot.id, saborId, claveSolicitud: randomUUID(), litrosConsumidos: 0.001, litrosObtenidos: 0.001 }); }
  catch { overprocessRejected = true; }
  if (!overprocessRejected) throw new Error('Service allowed overprocessing');
  let naturalRejected = false;
  try { await service.condition({ loteId: serviceLot.id, saborId: natural.id, claveSolicitud: randomUUID(), litrosConsumidos: 1, litrosObtenidos: 1 }); }
  catch { naturalRejected = true; }
  if (!naturalRejected) throw new Error('Service allowed Natural as a YogurtBase destination');
  const overview = await service.list('2100-01-03');
  const serviceSummary = overview.lotes.find((item) => item.id === serviceLot.id);
  if (serviceSummary?.litrosRestantes !== 0 || serviceSummary.litrosObtenidos !== 20.8) throw new Error('Service did not report remaining and conditioned output correctly');
  await prisma.acondicionamientoYogurtBase.deleteMany({ where: { loteId: serviceLot.id } });
  await prisma.loteYogurtBase.delete({ where: { id: serviceLot.id } });
  const concurrentLot = await service.createLot({ fechaElaboracion: '2100-01-04', cubetas10L: 2, cubetas6L: 0, cubetas4L: 0, litrosReales: 20 });
  const actualServiceRace = await Promise.allSettled([
    service.condition({ loteId: concurrentLot.id, saborId, claveSolicitud: randomUUID(), litrosConsumidos: 12, litrosObtenidos: 11.8 }),
    service.condition({ loteId: concurrentLot.id, saborId, claveSolicitud: randomUUID(), litrosConsumidos: 12, litrosObtenidos: 11.8 }),
  ]);
  if (actualServiceRace.filter((item) => item.status === 'fulfilled').length !== 1) throw new Error('Service allowed concurrent overprocessing');
  await prisma.acondicionamientoYogurtBase.deleteMany({ where: { loteId: concurrentLot.id } });
  await prisma.loteYogurtBase.delete({ where: { id: concurrentLot.id } });
  await prisma.sabor.delete({ where: { id: natural.id } });

  console.log('PASS: PostgreSQL constraints, exact decimals, idempotency, row-lock concurrency, rollback, immutable history, service flow, partial transforms, overprocessing guard and Natural exclusion');
} finally {
  if (lotId) await prisma.acondicionamientoYogurtBase.deleteMany({ where: { loteId: lotId } });
  if (lotId) await prisma.loteYogurtBase.deleteMany({ where: { id: lotId } });
  if (saborId) await prisma.sabor.deleteMany({ where: { id: saborId } });
  await prisma.$disconnect();
}
