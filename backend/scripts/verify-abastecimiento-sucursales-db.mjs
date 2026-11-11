import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { EstadoInventarioSucursal, EstadoPropuestaAbastecimiento, Prisma, PrismaClient, TurnoInventarioSucursal } from '@prisma/client';
import { AppModule } from '../dist/app.module.js';
import { loadPropuestaSources } from '../dist/modules/propuesta-abastecimiento/propuesta-abastecimiento.source.js';

const prisma = new PrismaClient();
const suffix = randomUUID().slice(0, 8);
const label = `Verify Abastecimiento ${suffix}`;
const sucursalIds = [];
const saborIds = [];
const reporteIds = [];
const propuestaIds = [];
let app;
let base;

async function api(path) {
  const response = await globalThis.fetch(`${base}${path}`);
  return { status: response.status, data: await response.json() };
}

async function createReport(sucursalId, fecha, confirmAt, flavors) {
  const report = await prisma.reporteInventarioSucursal.create({
    data: {
      sucursalId,
      fecha: new Date(`${fecha}T00:00:00.000Z`),
      turno: TurnoInventarioSucursal.VESPERTINO,
      estado: EstadoInventarioSucursal.CONFIRMADO,
      confirmadoAt: confirmAt,
      detalles: { create: flavors.map(({ saborId, litros }) => ({ saborId, litros: new Prisma.Decimal(litros) })) },
    },
  });
  reporteIds.push(report.id);
  return report;
}

async function createProposal({ sucursalId, fecha, version, estado, report, decisions }) {
  const source = (await prisma.$transaction((tx) => loadPropuestaSources(tx, [sucursalId], fecha))).get(sucursalId);
  assert.ok(source);
  const proposal = await prisma.propuestaAbastecimiento.create({
    data: {
      sucursalId,
      fecha: new Date(`${fecha}T00:00:00.000Z`),
      version,
      estado,
      fuenteReporteId: report?.id ?? null,
      fuenteFecha: report?.fecha ?? null,
      fuenteTurno: report?.turno ?? null,
      fuenteConfirmadoAt: report?.confirmadoAt ?? null,
      confirmadaAt: estado === EstadoPropuestaAbastecimiento.CONFIRMADA ? new Date('2099-05-02T19:00:00.000Z') : null,
      detalles: { create: source.details.map((item) => ({
        ...item,
        decisionLitros: Object.hasOwn(decisions, item.saborId) ? decisions[item.saborId] === null ? null : new Prisma.Decimal(decisions[item.saborId]) : item.decisionLitros,
      })) },
    },
  });
  propuestaIds.push(proposal.id);
  return proposal;
}

try {
  if (!globalThis.process.env.DATABASE_URL?.includes('consolidado_abastecimiento_test')) throw new Error('DATABASE_URL debe apuntar a consolidado_abastecimiento_test');
  const protectedCounts = await Promise.all([
    prisma.concentradoSucursales.count(), prisma.loteYogurtBase.count(), prisma.acondicionamientoYogurtBase.count(),
    prisma.pedidoProduccion.count(), prisma.cliente.count(), prisma.registroExistencias.count(), prisma.movimientoBitacora.count(),
  ]);
  const summaryDate = '2099-05-02';
  const sourceDate = '2099-05-01';
  const [fresa, nuez, natural, inactiveFlavor] = await Promise.all(['Fresa', 'Nuez', 'Natural', 'Ciruela'].map((nombre, index) => prisma.sabor.create({ data: { nombre: `${label} ${nombre}`, activo: index !== 3 } })));
  saborIds.push(fresa.id, nuez.id, natural.id, inactiveFlavor.id);
  const [approvedBranch, pendingBranch, staleBranch, emptyBranch] = await Promise.all([
    prisma.sucursal.create({ data: { nombre: `${label} Aprobada`, activo: true } }),
    prisma.sucursal.create({ data: { nombre: `${label} Pendiente`, activo: true } }),
    prisma.sucursal.create({ data: { nombre: `${label} Inactiva`, activo: false } }),
    prisma.sucursal.create({ data: { nombre: `${label} Sin propuesta`, activo: true } }),
  ]);
  sucursalIds.push(approvedBranch.id, pendingBranch.id, staleBranch.id, emptyBranch.id);

  for (const branch of [approvedBranch, pendingBranch, staleBranch]) {
    await prisma.stockObjetivoSucursal.createMany({ data: [
      { sucursalId: branch.id, saborId: fresa.id, litros: new Prisma.Decimal(branch.id === staleBranch.id ? '10' : '10') },
      { sucursalId: branch.id, saborId: nuez.id, litros: new Prisma.Decimal('0') },
    ] });
  }
  await prisma.stockObjetivoSucursal.create({ data: { sucursalId: approvedBranch.id, saborId: inactiveFlavor.id, litros: new Prisma.Decimal('5') } });

  const sourceReports = new Map();
  for (const branch of [approvedBranch, pendingBranch, staleBranch]) {
    sourceReports.set(branch.id, await createReport(branch.id, sourceDate, new Date('2099-05-01T19:00:00.000Z'), [
      { saborId: fresa.id, litros: branch.id === approvedBranch.id ? '2.875' : '1.5' },
      { saborId: nuez.id, litros: '0' },
    ]));
  }

  const approvedOld = await createProposal({ sucursalId: approvedBranch.id, fecha: summaryDate, version: 1, estado: EstadoPropuestaAbastecimiento.CONFIRMADA, report: sourceReports.get(approvedBranch.id), decisions: { [fresa.id]: '88', [nuez.id]: '7' } });
  const approvedLatest = await createProposal({ sucursalId: approvedBranch.id, fecha: summaryDate, version: 2, estado: EstadoPropuestaAbastecimiento.CONFIRMADA, report: sourceReports.get(approvedBranch.id), decisions: { [fresa.id]: '7.125', [nuez.id]: '0', [inactiveFlavor.id]: null } });
  const pendingOld = await createProposal({ sucursalId: pendingBranch.id, fecha: summaryDate, version: 1, estado: EstadoPropuestaAbastecimiento.CONFIRMADA, report: sourceReports.get(pendingBranch.id), decisions: { [fresa.id]: '99', [nuez.id]: '8' } });
  const pendingLatest = await createProposal({ sucursalId: pendingBranch.id, fecha: summaryDate, version: 2, estado: EstadoPropuestaAbastecimiento.BORRADOR, report: sourceReports.get(pendingBranch.id), decisions: { [fresa.id]: '40', [nuez.id]: '60' } });
  const staleProposal = await createProposal({ sucursalId: staleBranch.id, fecha: summaryDate, version: 1, estado: EstadoPropuestaAbastecimiento.CONFIRMADA, report: sourceReports.get(staleBranch.id), decisions: { [fresa.id]: '77', [nuez.id]: '4' } });
  await prisma.stockObjetivoSucursal.update({ where: { sucursalId_saborId: { sucursalId: staleBranch.id, saborId: fresa.id } }, data: { litros: new Prisma.Decimal('12') } });

  assert.notEqual(approvedOld.id, approvedLatest.id);
  assert.notEqual(pendingOld.id, pendingLatest.id);
  assert.ok(propuestaIds.includes(staleProposal.id));
  const proposalSnapshotBefore = await prisma.propuestaAbastecimiento.findMany({
    where: { id: { in: propuestaIds } },
    orderBy: { id: 'asc' },
    include: { detalles: { orderBy: { saborId: 'asc' } } },
  });

  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;

  const response = await api(`/abastecimiento-sucursales/resumen?fecha=${summaryDate}`);
  assert.equal(response.status, 200);
  assert.equal(response.data.fecha, summaryDate);
  const branches = new Map(response.data.sucursales.map((branch) => [branch.sucursalId, branch]));
  const approved = branches.get(approvedBranch.id);
  assert.equal(approved.estado, 'APROBADA');
  assert.equal(approved.version, 2);
  assert.equal(approved.propuestaId, approvedLatest.id);
  assert.equal(approved.detalle.find((item) => item.saborId === fresa.id).litrosDecididos, '7.125');
  assert.equal(approved.detalle.find((item) => item.saborId === nuez.id).litrosDecididos, '0');
  assert.equal(approved.detalle.find((item) => item.saborId === natural.id).litrosDecididos, null);
  assert.equal(approved.detalle.find((item) => item.saborId === inactiveFlavor.id).saborActivo, false);
  assert.equal(approved.detalle.find((item) => item.saborId === inactiveFlavor.id).litrosDecididos, null);

  const pending = branches.get(pendingBranch.id);
  assert.equal(pending.estado, 'PENDIENTE');
  assert.equal(pending.version, 2);
  assert.equal(pending.propuestaId, pendingLatest.id);
  assert.ok(pending.detalle.every((item) => item.litrosDecididos === null));

  const stale = branches.get(staleBranch.id);
  assert.equal(stale.estado, 'REQUIERE_REVISION');
  assert.equal(stale.sucursalActiva, false);
  assert.ok(stale.detalle.every((item) => item.litrosDecididos === null));
  assert.equal(branches.get(emptyBranch.id).estado, 'SIN_PROPUESTA');

  assert.deepEqual(response.data.conteos, { aprobadas: 1, pendientes: 1, requiereRevision: 1, sinPropuesta: 1 });
  assert.equal(response.data.consolidadoPorSabor.length, 2);
  assert.deepEqual(response.data.consolidadoPorSabor.map((item) => [item.saborId, item.litrosDecididos]), [[fresa.id, '7.125'], [nuez.id, '0']]);
  assert.equal(response.data.totalLitrosAprobados, '7.125');
  assert.ok(response.data.alertas.some((alert) => alert.propuestaId === pendingLatest.id && alert.tipo === 'BORRADOR'));
  assert.ok(response.data.alertas.some((alert) => alert.propuestaId === staleProposal.id && alert.tipo === 'OBSOLESCENCIA'));

  const invalidDate = await api('/abastecimiento-sucursales/resumen?fecha=2099-02-30');
  assert.equal(invalidDate.status, 400);
  const defaultSummary = await api('/abastecimiento-sucursales/resumen');
  assert.equal(defaultSummary.status, 200);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: defaultSummary.data.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  assert.equal(defaultSummary.data.fecha, `${values.year}-${values.month}-${values.day}`);

  const unchangedCounts = await Promise.all([
    prisma.concentradoSucursales.count(), prisma.loteYogurtBase.count(), prisma.acondicionamientoYogurtBase.count(),
    prisma.pedidoProduccion.count(), prisma.cliente.count(), prisma.registroExistencias.count(), prisma.movimientoBitacora.count(),
  ]);
  assert.deepEqual(unchangedCounts, protectedCounts);
  const proposalSnapshotAfter = await prisma.propuestaAbastecimiento.findMany({
    where: { id: { in: propuestaIds } },
    orderBy: { id: 'asc' },
    include: { detalles: { orderBy: { saborId: 'asc' } } },
  });
  assert.deepEqual(proposalSnapshotAfter, proposalSnapshotBefore);

  globalThis.console.log('PASS: latest version only; confirmed/current decisions; draft and obsolete exclusion; Decimal and explicit zero; absent decision; inactive branch/history; local BUSINESS_TIMEZONE default; invalid date; read-only module integrity');
} finally {
  if (app) await app.close();
  if (propuestaIds.length) {
    await prisma.detallePropuestaAbastecimiento.deleteMany({ where: { propuestaId: { in: propuestaIds } } });
    await prisma.propuestaAbastecimiento.deleteMany({ where: { id: { in: propuestaIds } } });
  }
  if (reporteIds.length) {
    await prisma.detalleInventarioSucursal.deleteMany({ where: { reporteId: { in: reporteIds } } });
    await prisma.reporteInventarioSucursal.deleteMany({ where: { id: { in: reporteIds } } });
  }
  if (sucursalIds.length) await prisma.stockObjetivoSucursal.deleteMany({ where: { sucursalId: { in: sucursalIds } } });
  if (sucursalIds.length) await prisma.sucursal.deleteMany({ where: { id: { in: sucursalIds } } });
  if (saborIds.length) await prisma.sabor.deleteMany({ where: { id: { in: saborIds } } });
  await prisma.$disconnect();
}
