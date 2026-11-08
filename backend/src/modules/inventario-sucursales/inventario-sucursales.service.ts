import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoInventarioSucursal, Prisma, TurnoInventarioSucursal } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service.js';
import { DEFAULT_BUSINESS_TIMEZONE, resolveBusinessDate } from '../produccion/business-date.js';
import { GuardarInventarioDto } from './dto.js';
import { horarioSucursal } from './turnos.js';

const reportInclude = {
  sucursal: { select: { id: true, nombre: true, activo: true } },
  detalles: { include: { sabor: { select: { id: true, nombre: true } } }, orderBy: { saborId: 'asc' as const } },
};

@Injectable()
export class InventarioSucursalesService {
  private readonly timezone: string;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    this.timezone = config.get<string>('BUSINESS_TIMEZONE')?.trim() || DEFAULT_BUSINESS_TIMEZONE;
  }

  private businessDate(fecha?: string) {
    try { return resolveBusinessDate(fecha, this.timezone, new Date(), 'today'); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Fecha o zona horaria inválida'); }
  }

  private day(fecha: string) {
    this.businessDate(fecha);
    return new Date(`${fecha}T00:00:00.000Z`);
  }

  async captura() {
    const window = this.businessDate();
    const [sucursales, sabores] = await Promise.all([
      this.prisma.sucursal.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
      this.prisma.sabor.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    ]);
    return { fecha: window.fecha, timezone: window.timezone, sucursales: sucursales.map((sucursal) => ({ ...sucursal, horarios: horarioSucursal(sucursal.nombre) })), sabores };
  }

  async reporte(sucursalId: number, fecha: string, turno: TurnoInventarioSucursal) {
    const report = await this.prisma.reporteInventarioSucursal.findUnique({
      where: { sucursalId_fecha_turno: { sucursalId, fecha: this.day(fecha), turno } }, include: reportInclude,
    });
    return { fecha, turno, reporte: report ? this.serializeReport(report) : null };
  }

  private validateDetails(details: GuardarInventarioDto['detalles']) {
    if (!Array.isArray(details)) throw new BadRequestException('detalles debe ser una lista');
    const ids = new Set<number>();
    for (const detail of details) {
      if (!Number.isInteger(detail.saborId) || detail.saborId < 1 || typeof detail.litros !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(detail.litros)) {
        throw new BadRequestException('Cada renglón requiere un sabor y litros decimales no negativos de hasta tres posiciones');
      }
      if (ids.has(detail.saborId)) throw new BadRequestException('No repitas sabores en el reporte');
      ids.add(detail.saborId);
    }
    return [...ids];
  }

  async guardar(data: GuardarInventarioDto) {
    const fecha = this.day(data.fecha);
    if (!Object.values(TurnoInventarioSucursal).includes(data.turno)) throw new BadRequestException('turno debe ser MATUTINO o VESPERTINO');
    const saborIds = this.validateDetails(data.detalles);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const sucursal = await tx.sucursal.findUnique({ where: { id: data.sucursalId } });
        if (!sucursal || !sucursal.activo) throw new NotFoundException('Sucursal activa no encontrada');
        const sabores = await tx.sabor.findMany({ where: { id: { in: saborIds }, activo: true }, select: { id: true } });
        if (sabores.length !== saborIds.length) throw new BadRequestException('Todos los sabores deben existir y estar activos');

        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ReporteInventarioSucursal" WHERE "fecha" = ${fecha} AND "sucursalId" = ${data.sucursalId} AND "turno" = CAST(${data.turno} AS "TurnoInventarioSucursal") FOR UPDATE`);
        const key = { sucursalId_fecha_turno: { fecha, sucursalId: data.sucursalId, turno: data.turno } };
        const existing = await tx.reporteInventarioSucursal.findUnique({ where: key });
        if (existing?.estado === EstadoInventarioSucursal.CONFIRMADO) throw new ConflictException('El inventario de esta sucursal y turno ya está confirmado para la fecha');
        const report = existing
          ? await tx.reporteInventarioSucursal.update({ where: { id: existing.id }, data: { updatedAt: new Date() } })
          : await tx.reporteInventarioSucursal.create({ data: { fecha, sucursalId: data.sucursalId, turno: data.turno } });
        await tx.detalleInventarioSucursal.deleteMany({ where: { reporteId: report.id } });
        if (data.detalles.length) {
          await tx.detalleInventarioSucursal.createMany({ data: data.detalles.map((detail) => ({ reporteId: report.id, saborId: detail.saborId, litros: new Prisma.Decimal(detail.litros) })) });
        }
        return this.serializeReport(await tx.reporteInventarioSucursal.findUniqueOrThrow({ where: { id: report.id }, include: reportInclude }));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
        throw new ConflictException('El reporte cambió durante la operación; vuelve a cargarlo e intenta de nuevo');
      }
      throw error;
    }
  }

  async confirmar(id: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT "id" FROM "ReporteInventarioSucursal" WHERE "id" = ${id} FOR UPDATE`);
        if (!rows.length) throw new NotFoundException('Reporte de inventario no encontrado');
        const report = await tx.reporteInventarioSucursal.findUniqueOrThrow({ where: { id } });
        if (report.estado === EstadoInventarioSucursal.CONFIRMADO) throw new ConflictException('Este inventario ya está confirmado');
        const detalleCount = await tx.detalleInventarioSucursal.count({ where: { reporteId: id } });
        if (detalleCount === 0) throw new BadRequestException('Agrega al menos un sabor con litros explícitos, incluso cero, antes de confirmar');
        return this.serializeReport(await tx.reporteInventarioSucursal.update({
          where: { id }, data: { estado: EstadoInventarioSucursal.CONFIRMADO, confirmadoAt: new Date() }, include: reportInclude,
        }));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('El reporte cambió durante la operación; vuelve a cargarlo e intenta de nuevo');
      }
      throw error;
    }
  }

  async consultar(fecha: string | undefined, turno: TurnoInventarioSucursal) {
    const window = this.businessDate(fecha);
    const date = this.day(window.fecha);
    if (!Object.values(TurnoInventarioSucursal).includes(turno)) throw new BadRequestException('turno debe ser MATUTINO o VESPERTINO');
    const [branches, reports, latestGroups, legacyGroups] = await Promise.all([
      this.prisma.sucursal.findMany({ select: { id: true, nombre: true, activo: true }, orderBy: { id: 'asc' } }),
      this.prisma.reporteInventarioSucursal.findMany({
        where: { fecha: date, turno, estado: EstadoInventarioSucursal.CONFIRMADO }, include: reportInclude,
        orderBy: { sucursalId: 'asc' },
      }),
      this.prisma.reporteInventarioSucursal.groupBy({
        by: ['sucursalId'], where: { fecha: { lte: date }, turno, estado: EstadoInventarioSucursal.CONFIRMADO }, _max: { fecha: true },
      }),
      this.prisma.reporteInventarioSucursal.groupBy({
        by: ['sucursalId'], where: { fecha: { lte: date }, turno: null, estado: EstadoInventarioSucursal.CONFIRMADO }, _max: { fecha: true },
      }),
    ]);
    const [latestReports, legacyReports] = await Promise.all([
      latestGroups.length ? this.prisma.reporteInventarioSucursal.findMany({
        where: { OR: latestGroups.flatMap(({ sucursalId, _max }) => _max.fecha ? [{ sucursalId, fecha: _max.fecha, turno, estado: EstadoInventarioSucursal.CONFIRMADO }] : []) },
        include: reportInclude,
      }) : Promise.resolve([]),
      legacyGroups.length ? this.prisma.reporteInventarioSucursal.findMany({
        where: { OR: legacyGroups.flatMap(({ sucursalId, _max }) => _max.fecha ? [{ sucursalId, fecha: _max.fecha, turno: null, estado: EstadoInventarioSucursal.CONFIRMADO }] : []) },
        include: reportInclude,
      }) : Promise.resolve([]),
    ]);
    const totals = new Map<number, { saborId: number; sabor: string; litros: Prisma.Decimal }>();
    for (const report of reports) for (const detail of report.detalles) {
      const total = totals.get(detail.saborId) ?? { saborId: detail.saborId, sabor: detail.sabor.nombre, litros: new Prisma.Decimal(0) };
      total.litros = total.litros.plus(detail.litros);
      totals.set(detail.saborId, total);
    }
    const confirmedBranchIds = new Set(reports.map((report) => report.sucursalId));
    const latestByBranch = new Map(latestReports.map((report) => [report.sucursalId, this.serializeReport(report)]));
    const legacyByBranch = new Map(legacyReports.map((report) => [report.sucursalId, this.serializeReport(report)]));
    return {
      fecha: window.fecha,
      turno,
      timezone: window.timezone,
      sucursalesPendientes: branches.filter(({ id }) => !confirmedBranchIds.has(id)),
      sucursales: reports.map((report) => this.serializeReport(report)),
      consolidado: [...totals.values()].sort((a, b) => a.sabor.localeCompare(b.sabor)).map(({ saborId, sabor, litros }) => ({ saborId, sabor, litros: litros.toString() })),
      ultimoInventarioConfirmadoPorSucursal: branches.map((sucursal) => ({ sucursalId: sucursal.id, sucursal: sucursal.nombre, activo: sucursal.activo, reporte: latestByBranch.get(sucursal.id) ?? null })),
      historicosAnterioresSinTurno: branches.flatMap((sucursal) => {
        const reporte = legacyByBranch.get(sucursal.id);
        return reporte ? [{ sucursalId: sucursal.id, sucursal: sucursal.nombre, reporte }] : [];
      }),
    };
  }

  private serializeReport(report: {
    id: number; sucursalId: number; fecha: Date; turno: TurnoInventarioSucursal | null; estado: EstadoInventarioSucursal; confirmadoAt: Date | null; createdAt: Date; updatedAt: Date;
    sucursal?: { id: number; nombre: string; activo: boolean };
    detalles: { saborId: number; litros: Prisma.Decimal; sabor: { id: number; nombre: string } }[];
  }) {
    return {
      id: report.id,
      sucursalId: report.sucursalId,
      turno: report.turno,
      ...(report.sucursal ? { sucursal: report.sucursal.nombre, sucursalActiva: report.sucursal.activo } : {}),
      fecha: report.fecha.toISOString().slice(0, 10),
      estado: report.estado,
      confirmadoAt: report.confirmadoAt,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      detalles: report.detalles.map((detail) => ({ saborId: detail.saborId, sabor: detail.sabor.nombre, litros: detail.litros.toString() })),
    };
  }
}
