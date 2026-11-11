import { EstadoInventarioSucursal, EstadoReferenciaAbastecimiento, Prisma, TurnoInventarioSucursal } from '@prisma/client';

export type PropuestaSourceDetail = {
  saborId: number;
  objetivoLitros: Prisma.Decimal | null;
  objetivoActualizadoAt: Date | null;
  existenciaLitros: Prisma.Decimal | null;
  sugerenciaLitros: Prisma.Decimal | null;
  decisionLitros: Prisma.Decimal | null;
  estadoReferencia: EstadoReferenciaAbastecimiento;
};

export type PropuestaSource = {
  report: { id: number; fecha: Date; turno: TurnoInventarioSucursal | null; confirmadoAt: Date | null } | null;
  details: PropuestaSourceDetail[];
};

export async function loadPropuestaSources(tx: Prisma.TransactionClient, sucursalIds: number[], fecha: string) {
  const result = new Map<number, PropuestaSource>();
  if (sucursalIds.length === 0) return result;

  const sourceDay = new Date(`${fecha}T00:00:00.000Z`);
  sourceDay.setUTCDate(sourceDay.getUTCDate() - 1);
  const [reports, goals, activeFlavors] = await Promise.all([
    tx.reporteInventarioSucursal.findMany({
      where: { sucursalId: { in: sucursalIds }, fecha: sourceDay, turno: TurnoInventarioSucursal.VESPERTINO },
      include: { detalles: { orderBy: { saborId: 'asc' } } },
    }),
    tx.stockObjetivoSucursal.findMany({ where: { sucursalId: { in: sucursalIds } }, orderBy: [{ sucursalId: 'asc' }, { saborId: 'asc' }] }),
    tx.sabor.findMany({ where: { activo: true }, select: { id: true }, orderBy: { id: 'asc' } }),
  ]);
  const reportByBranch = new Map(reports.map((report) => [report.sucursalId, report]));
  const goalsByBranch = new Map<number, typeof goals>();
  for (const goal of goals) goalsByBranch.set(goal.sucursalId, [...(goalsByBranch.get(goal.sucursalId) ?? []), goal]);

  for (const sucursalId of sucursalIds) {
    const foundReport = reportByBranch.get(sucursalId);
    const report = foundReport?.estado === EstadoInventarioSucursal.CONFIRMADO && foundReport.turno === TurnoInventarioSucursal.VESPERTINO ? foundReport : null;
    const branchGoals = goalsByBranch.get(sucursalId) ?? [];
    const objectiveByFlavor = new Map(branchGoals.map((item) => [item.saborId, { litros: item.litros, updatedAt: item.updatedAt }]));
    const existenceByFlavor = new Map((report?.detalles ?? []).map((item) => [item.saborId, item.litros]));
    const ids = [...new Set([
      ...activeFlavors.map(({ id }) => id),
      ...branchGoals.map(({ saborId }) => saborId),
      ...(report?.detalles ?? []).map(({ saborId }) => saborId),
    ])].sort((a, b) => a - b);
    const details = ids.map((saborId) => {
      const objective = objectiveByFlavor.get(saborId);
      const objetivoLitros = objective?.litros ?? null;
      const existenciaLitros = existenceByFlavor.get(saborId) ?? null;
      const complete = objetivoLitros !== null && existenciaLitros !== null;
      return {
        saborId,
        objetivoLitros,
        objetivoActualizadoAt: objective?.updatedAt ?? null,
        existenciaLitros,
        sugerenciaLitros: complete ? Prisma.Decimal.max(objetivoLitros.minus(existenciaLitros), new Prisma.Decimal(0)) : null,
        decisionLitros: complete ? Prisma.Decimal.max(objetivoLitros.minus(existenciaLitros), new Prisma.Decimal(0)) : null,
        estadoReferencia: complete ? EstadoReferenciaAbastecimiento.DISPONIBLE : EstadoReferenciaAbastecimiento.SIN_DATOS,
      };
    });
    result.set(sucursalId, { report: report ? { id: report.id, fecha: report.fecha, turno: report.turno, confirmadoAt: report.confirmadoAt } : null, details });
  }
  return result;
}

export function propuestaObsoleta(
  proposal: { fuenteReporteId: number | null; fuenteConfirmadoAt: Date | null; detalles: PropuestaSourceDetail[] },
  source: PropuestaSource,
) {
  const currentReport = source.report;
  const sourceMatches = proposal.fuenteReporteId === (currentReport?.id ?? null)
    && proposal.fuenteConfirmadoAt?.toISOString() === currentReport?.confirmadoAt?.toISOString();
  const current = new Map(source.details.map((item) => [item.saborId, item]));
  const detailsMatch = proposal.detalles.length === current.size && proposal.detalles.every((item) => {
    const now = current.get(item.saborId);
    if (!now) return false;
    const objectiveMatches = item.objetivoLitros === null ? now.objetivoLitros === null : item.objetivoLitros.equals(now.objetivoLitros ?? new Prisma.Decimal(-1));
    const existenceMatches = item.existenciaLitros === null ? now.existenciaLitros === null : item.existenciaLitros.equals(now.existenciaLitros ?? new Prisma.Decimal(-1));
    return objectiveMatches
      && existenceMatches
      && item.objetivoActualizadoAt?.toISOString() === now.objetivoActualizadoAt?.toISOString();
  });
  return !sourceMatches || !detailsMatch;
}
