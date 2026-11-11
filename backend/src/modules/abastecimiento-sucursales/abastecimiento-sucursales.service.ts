import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoPropuestaAbastecimiento, Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service.js';
import { DEFAULT_BUSINESS_TIMEZONE, resolveBusinessDate } from '../produccion/business-date.js';
import { loadPropuestaSources, propuestaObsoleta } from '../propuesta-abastecimiento/propuesta-abastecimiento.source.js';

const proposalInclude = {
  detalles: {
    include: { sabor: { select: { id: true, nombre: true, activo: true } } },
    orderBy: [{ saborId: 'asc' as const }],
  },
} satisfies Prisma.PropuestaAbastecimientoInclude;

type Proposal = Prisma.PropuestaAbastecimientoGetPayload<{ include: typeof proposalInclude }>;
type Status = 'APROBADA' | 'PENDIENTE' | 'REQUIERE_REVISION' | 'SIN_PROPUESTA';

@Injectable()
export class AbastecimientoSucursalesService {
  private readonly timezone: string;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    this.timezone = config.get<string>('BUSINESS_TIMEZONE')?.trim() || DEFAULT_BUSINESS_TIMEZONE;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: this.timezone });
    } catch {
      throw new Error(`BUSINESS_TIMEZONE no es una zona horaria válida: ${this.timezone}`);
    }
  }

  async get(fecha?: string) {
    let window;
    try {
      window = resolveBusinessDate(fecha, this.timezone, new Date(), 'today');
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Fecha o zona horaria inválida');
    }
    const day = new Date(`${window.fecha}T00:00:00.000Z`);

    return this.prisma.$transaction(async (tx) => {
      const [branches, versions] = await Promise.all([
        tx.sucursal.findMany({ orderBy: [{ nombre: 'asc' }, { id: 'asc' }], select: { id: true, nombre: true, activo: true } }),
        tx.propuestaAbastecimiento.groupBy({ by: ['sucursalId'], where: { fecha: day }, _max: { version: true } }),
      ]);
      const latestVersions = versions.flatMap(({ sucursalId, _max }) => _max.version === null ? [] : [{ sucursalId, version: _max.version }]);
      const proposals: Proposal[] = latestVersions.length
        ? await tx.propuestaAbastecimiento.findMany({
          where: { fecha: day, OR: latestVersions },
          include: proposalInclude,
        })
        : [];
      const proposalByBranch = new Map(proposals.map((proposal) => [proposal.sucursalId, proposal]));
      const sources = await loadPropuestaSources(tx, branches.map(({ id }) => id), window.fecha);
      const consolidated = new Map<number, { saborId: number; sabor: string; saborActivo: boolean; litrosDecididos: Prisma.Decimal }>();
      const alerts: Array<{ tipo: 'BORRADOR' | 'OBSOLESCENCIA'; sucursalId: number; sucursal: string; propuestaId: number; version: number; mensaje: string }> = [];

      const sucursales = branches.map((branch) => {
        const proposal = proposalByBranch.get(branch.id);
        if (!proposal) return {
          sucursalId: branch.id, sucursal: branch.nombre, sucursalActiva: branch.activo,
          estado: 'SIN_PROPUESTA' as const, version: null, propuestaId: null, confirmadoAt: null,
          detalle: [],
        };

        const source = sources.get(branch.id)!;
        const obsoleta = propuestaObsoleta(proposal, source);
        const status: Status = obsoleta
          ? 'REQUIERE_REVISION'
          : proposal.estado === EstadoPropuestaAbastecimiento.CONFIRMADA ? 'APROBADA' : 'PENDIENTE';
        const approved = status === 'APROBADA';
        if (proposal.estado === EstadoPropuestaAbastecimiento.BORRADOR) alerts.push({
          tipo: 'BORRADOR', sucursalId: branch.id, sucursal: branch.nombre, propuestaId: proposal.id, version: proposal.version,
          mensaje: `La versión ${proposal.version} continúa como borrador.`,
        });
        if (obsoleta) alerts.push({
          tipo: 'OBSOLESCENCIA', sucursalId: branch.id, sucursal: branch.nombre, propuestaId: proposal.id, version: proposal.version,
          mensaje: `La fuente de la versión ${proposal.version} cambió y requiere revisión.`,
        });

        const detalle = proposal.detalles.map((item) => {
          const decision = approved ? item.decisionLitros : null;
          if (approved && decision !== null) {
            const aggregate = consolidated.get(item.saborId);
            if (aggregate) aggregate.litrosDecididos = aggregate.litrosDecididos.plus(decision);
            else consolidated.set(item.saborId, {
              saborId: item.saborId, sabor: item.sabor.nombre, saborActivo: item.sabor.activo,
              litrosDecididos: decision,
            });
          }
          return {
            saborId: item.saborId, sabor: item.sabor.nombre, saborActivo: item.sabor.activo,
            litrosDecididos: decision?.toString() ?? null,
          };
        });
        return {
          sucursalId: branch.id, sucursal: branch.nombre, sucursalActiva: branch.activo,
          estado: status, version: proposal.version, propuestaId: proposal.id,
          confirmadoAt: proposal.confirmadaAt, detalle,
        };
      });

      const total = [...consolidated.values()].reduce((sum, item) => sum.plus(item.litrosDecididos), new Prisma.Decimal(0));
      const consolidadoPorSabor = [...consolidated.values()]
        .map((item) => ({ saborId: item.saborId, sabor: item.sabor, saborActivo: item.saborActivo, litrosDecididos: item.litrosDecididos.toString() }))
        .sort((a, b) => a.sabor.localeCompare(b.sabor, 'es') || a.saborId - b.saborId);
      const conteos = {
        aprobadas: sucursales.filter((item) => item.estado === 'APROBADA').length,
        pendientes: sucursales.filter((item) => item.estado === 'PENDIENTE').length,
        requiereRevision: sucursales.filter((item) => item.estado === 'REQUIERE_REVISION').length,
        sinPropuesta: sucursales.filter((item) => item.estado === 'SIN_PROPUESTA').length,
      };
      return {
        fecha: window.fecha,
        timezone: window.timezone,
        sucursales,
        consolidadoPorSabor,
        totalLitrosAprobados: total.toString(),
        conteos,
        alertas: alerts,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
