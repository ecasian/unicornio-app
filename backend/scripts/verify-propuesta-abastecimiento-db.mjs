import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Prisma, PrismaClient, TurnoInventarioSucursal } from '@prisma/client';
import { AppModule } from '../dist/app.module.js';

const prisma = new PrismaClient();
const suffix = randomUUID().slice(0, 8);
const baseName = `Verify Propuesta ${suffix}`;
let sucursal;
let sabores = [];
let reporte;
let app;
let base;

async function api(path, method = 'GET', body) {
  const response = await globalThis.fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  return { status: response.status, data };
}

try {
  if (!globalThis.process.env.DATABASE_URL?.includes('propuesta_abastecimiento_sucursales_test')) throw new Error('DATABASE_URL debe apuntar a propuesta_abastecimiento_sucursales_test');
  const protectedCounts = await Promise.all([
    prisma.concentradoSucursales.count(), prisma.loteYogurtBase.count(), prisma.pedidoProduccion.count(),
    prisma.cliente.count(), prisma.registroExistencias.count(), prisma.movimientoBitacora.count(),
  ]);
  sucursal = await prisma.sucursal.create({ data: { nombre: baseName } });
  sabores = await Promise.all(['Fresa', 'Nuez', 'Natural', 'Mango'].map((nombre) => prisma.sabor.create({ data: { nombre: `${baseName} ${nombre}` } })));
  const [fresa, nuez, natural, mango] = sabores;
  await prisma.stockObjetivoSucursal.createMany({ data: [
    { sucursalId: sucursal.id, saborId: fresa.id, litros: new Prisma.Decimal('10') },
    { sucursalId: sucursal.id, saborId: nuez.id, litros: new Prisma.Decimal('0') },
    { sucursalId: sucursal.id, saborId: mango.id, litros: new Prisma.Decimal('5') },
  ] });
  reporte = await prisma.reporteInventarioSucursal.create({ data: {
    sucursalId: sucursal.id, fecha: new Date('2099-01-01T00:00:00.000Z'), turno: TurnoInventarioSucursal.VESPERTINO,
    estado: 'CONFIRMADO', confirmadoAt: new Date('2099-01-01T23:00:00.000Z'),
    detalles: { create: [
      { saborId: fresa.id, litros: new Prisma.Decimal('6.5') },
      { saborId: nuez.id, litros: new Prisma.Decimal('0') },
      { saborId: natural.id, litros: new Prisma.Decimal('1') },
    ] },
  } });

  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  base = `http://127.0.0.1:${address.port}/api`;
  assert.equal((await api('/propuestas-abastecimiento')).status, 400);

  const created = await api('/propuestas-abastecimiento', 'POST', { sucursalId: sucursal.id, fecha: '2099-01-02' });
  assert.equal(created.status, 201);
  let proposal = created.data;
  assert.equal(proposal.fuente.reporteId, reporte.id);
  assert.equal(proposal.detalles.find((item) => item.saborId === fresa.id).sugerenciaLitros, '3.5');
  assert.equal(proposal.detalles.find((item) => item.saborId === nuez.id).sugerenciaLitros, '0');
  assert.equal(proposal.detalles.find((item) => item.saborId === natural.id).estadoReferencia, 'SIN_DATOS');
  assert.equal(proposal.detalles.find((item) => item.saborId === natural.id).decisionLitros, null);
  assert.equal(proposal.detalles.find((item) => item.saborId === mango.id).estadoReferencia, 'SIN_DATOS');

  const duplicateDraft = await api('/propuestas-abastecimiento', 'POST', { sucursalId: sucursal.id, fecha: '2099-01-02' });
  assert.equal(duplicateDraft.status, 409);
  const invalidNegative = await api(`/propuestas-abastecimiento/${proposal.id}/decisiones`, 'PUT', { decisiones: [{ saborId: fresa.id, decisionLitros: '-1' }] });
  assert.equal(invalidNegative.status, 400);
  const invalidPrecision = await api(`/propuestas-abastecimiento/${proposal.id}/decisiones`, 'PUT', { decisiones: [{ saborId: fresa.id, decisionLitros: '1.0001' }] });
  assert.equal(invalidPrecision.status, 400);
  const omittedDecision = await api(`/propuestas-abastecimiento/${proposal.id}/decisiones`, 'PUT', { decisiones: [{ saborId: fresa.id }] });
  assert.equal(omittedDecision.status, 400);
  const duplicateFlavor = await api(`/propuestas-abastecimiento/${proposal.id}/decisiones`, 'PUT', { decisiones: [{ saborId: fresa.id, decisionLitros: '1' }, { saborId: fresa.id, decisionLitros: '2' }] });
  assert.equal(duplicateFlavor.status, 400);

  const edited = await api(`/propuestas-abastecimiento/${proposal.id}/decisiones`, 'PUT', { decisiones: [
    { saborId: fresa.id, decisionLitros: '4.125' }, { saborId: nuez.id, decisionLitros: '0' },
    { saborId: natural.id, decisionLitros: '1.25' }, { saborId: mango.id, decisionLitros: '2.5' },
  ] });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.detalles.find((item) => item.saborId === fresa.id).decisionLitros, '4.125');
  const invalidReference = await api(`/propuestas-abastecimiento/${proposal.id}/decisiones`, 'PUT', { decisiones: [{ saborId: 999999, decisionLitros: '1' }] });
  assert.equal(invalidReference.status, 404);
  assert.equal((await api(`/propuestas-abastecimiento/${proposal.id}`)).data.detalles.find((item) => item.saborId === fresa.id).decisionLitros, '4.125');

  await prisma.stockObjetivoSucursal.update({ where: { sucursalId_saborId: { sucursalId: sucursal.id, saborId: fresa.id } }, data: { litros: new Prisma.Decimal('12') } });
  const stale = await api(`/propuestas-abastecimiento/${proposal.id}`);
  assert.equal(stale.data.obsoleta, true);
  const blockedConfirm = await api(`/propuestas-abastecimiento/${proposal.id}/confirmacion`, 'POST');
  assert.equal(blockedConfirm.status, 409);
  const recalculated = await api(`/propuestas-abastecimiento/${proposal.id}/recalcular`, 'POST');
  assert.equal(recalculated.status, 201);
  proposal = recalculated.data;
  assert.equal(proposal.version, 2);
  assert.equal(proposal.detalles.find((item) => item.saborId === fresa.id).sugerenciaLitros, '5.5');
  assert.equal(proposal.detalles.find((item) => item.saborId === fresa.id).decisionLitros, '5.5');
  assert.equal(proposal.detalles.find((item) => item.saborId === natural.id).decisionLitros, null);
  await prisma.$executeRaw`UPDATE "StockObjetivoSucursal" SET "updatedAt" = "updatedAt" + INTERVAL '1 second' WHERE "sucursalId" = ${sucursal.id} AND "saborId" = ${fresa.id}`;
  assert.equal((await api(`/propuestas-abastecimiento/${proposal.id}`)).data.obsoleta, true);
  const refreshedSameValue = await api(`/propuestas-abastecimiento/${proposal.id}/recalcular`, 'POST');
  assert.equal(refreshedSameValue.data.version, 3);
  assert.equal(refreshedSameValue.data.detalles.find((item) => item.saborId === fresa.id).decisionLitros, '5.5');
  proposal = refreshedSameValue.data;

  const saved = await api(`/propuestas-abastecimiento/${proposal.id}/decisiones`, 'PUT', { decisiones: [
    { saborId: fresa.id, decisionLitros: '5.5' }, { saborId: nuez.id, decisionLitros: '0' },
    { saborId: natural.id, decisionLitros: '1' }, { saborId: mango.id, decisionLitros: '2' },
  ] });
  assert.equal(saved.status, 200);
  const confirmed = await api(`/propuestas-abastecimiento/${proposal.id}/confirmacion`, 'POST');
  assert.equal(confirmed.status, 201);
  assert.equal(confirmed.data.estado, 'CONFIRMADA');
  assert.equal((await api(`/propuestas-abastecimiento/${proposal.id}/confirmacion`, 'POST')).status, 409);
  const immutable = await api(`/propuestas-abastecimiento/${proposal.id}/decisiones`, 'PUT', { decisiones: [{ saborId: fresa.id, decisionLitros: '6' }] });
  assert.equal(immutable.status, 409);
  const priorVersion = await prisma.propuestaAbastecimiento.findUniqueOrThrow({ where: { id: created.data.id } });
  assert.equal(priorVersion.estado, 'BORRADOR');
  const nextVersion = await api('/propuestas-abastecimiento', 'POST', { sucursalId: sucursal.id, fecha: '2099-01-02' });
  assert.equal(nextVersion.status, 201);
  assert.equal(nextVersion.data.version, 4);
  assert.equal((await prisma.propuestaAbastecimiento.findUniqueOrThrow({ where: { id: proposal.id } })).estado, 'CONFIRMADA');
  const dailySummary = await api('/propuestas-abastecimiento?fecha=2099-01-02');
  assert.equal(dailySummary.status, 200);
  assert.equal(dailySummary.data.propuestas.length, 1);
  assert.equal(dailySummary.data.propuestas[0].version, 4);

  const beforeRollback = await prisma.propuestaAbastecimiento.count({ where: { sucursalId: sucursal.id } });
  await assert.rejects(prisma.$transaction(async (tx) => {
    const rolledBack = await tx.propuestaAbastecimiento.create({ data: { sucursalId: sucursal.id, fecha: new Date('2099-01-03T00:00:00.000Z'), version: 1 } });
    await tx.detallePropuestaAbastecimiento.create({ data: { propuestaId: rolledBack.id, saborId: fresa.id, estadoReferencia: 'SIN_DATOS', decisionLitros: new Prisma.Decimal('-1') } });
  }));
  assert.equal(await prisma.propuestaAbastecimiento.count({ where: { sucursalId: sucursal.id } }), beforeRollback);

  const priorProposals = await prisma.propuestaAbastecimiento.findMany({ where: { sucursalId: sucursal.id }, select: { id: true } });
  if (priorProposals.length) await prisma.detallePropuestaAbastecimiento.deleteMany({ where: { propuestaId: { in: priorProposals.map(({ id }) => id) } } });
  await prisma.propuestaAbastecimiento.deleteMany({ where: { sucursalId: sucursal.id } });
  const parallel = await Promise.all([
    api('/propuestas-abastecimiento', 'POST', { sucursalId: sucursal.id, fecha: '2099-01-04' }),
    api('/propuestas-abastecimiento', 'POST', { sucursalId: sucursal.id, fecha: '2099-01-04' }),
  ]);
  assert.equal(parallel.filter((item) => item.status === 201).length, 1);
  assert.ok(parallel.every((item) => item.status === 201 || item.status === 409));
  assert.equal(await prisma.propuestaAbastecimiento.count({ where: { sucursalId: sucursal.id, fecha: new Date('2099-01-04T00:00:00.000Z') } }), 1);
  assert.deepEqual(await Promise.all([
    prisma.concentradoSucursales.count(), prisma.loteYogurtBase.count(), prisma.pedidoProduccion.count(),
    prisma.cliente.count(), prisma.registroExistencias.count(), prisma.movimientoBitacora.count(),
  ]), protectedCounts);
  globalThis.console.log('PASS: exact source snapshot, decimal suggestions, SIN DATOS manual decision, stale-source 409, recalculation/versioning, confirmation immutability, rollback and PostgreSQL concurrency');
} finally {
  if (app) await app.close();
  if (sucursal) {
    const proposals = await prisma.propuestaAbastecimiento.findMany({ where: { sucursalId: sucursal.id }, select: { id: true } });
    if (proposals.length) await prisma.detallePropuestaAbastecimiento.deleteMany({ where: { propuestaId: { in: proposals.map(({ id }) => id) } } });
    await prisma.propuestaAbastecimiento.deleteMany({ where: { sucursalId: sucursal.id } });
    const reports = await prisma.reporteInventarioSucursal.findMany({ where: { sucursalId: sucursal.id }, select: { id: true } });
    if (reports.length) await prisma.detalleInventarioSucursal.deleteMany({ where: { reporteId: { in: reports.map(({ id }) => id) } } });
    await prisma.reporteInventarioSucursal.deleteMany({ where: { sucursalId: sucursal.id } });
    await prisma.stockObjetivoSucursal.deleteMany({ where: { sucursalId: sucursal.id } });
    await prisma.sucursal.delete({ where: { id: sucursal.id } });
  }
  if (sabores.length) await prisma.sabor.deleteMany({ where: { id: { in: sabores.map(({ id }) => id) } } });
  await prisma.$disconnect();
}
