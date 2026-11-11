import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoPropuestaAbastecimiento, Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service.js';
import { DEFAULT_BUSINESS_TIMEZONE, resolveBusinessDate } from '../produccion/business-date.js';
import { loadPropuestaSources, propuestaObsoleta } from './propuesta-abastecimiento.source.js';

const includeProposal = { sucursal: { select: { id: true, nombre: true, activo: true } }, fuenteReporte: { select: { id: true, fecha: true, turno: true, confirmadoAt: true } }, detalles: { include: { sabor: { select: { id: true, nombre: true, activo: true } } }, orderBy: { saborId: 'asc' as const } } };

@Injectable()
export class PropuestaAbastecimientoService {
  private readonly timezone: string;
  constructor(private readonly prisma: PrismaService, config: ConfigService) { this.timezone = config.get<string>('BUSINESS_TIMEZONE')?.trim() || DEFAULT_BUSINESS_TIMEZONE; }

  private date(value: string) {
    try { return resolveBusinessDate(value, this.timezone, new Date(), 'today'); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Fecha inválida'); }
  }

  private async serialize(tx: Prisma.TransactionClient | PrismaService, id: number) {
    const proposal = await tx.propuestaAbastecimiento.findUnique({ where: { id }, include: includeProposal });
    if (!proposal) throw new NotFoundException('Propuesta no encontrada');
    const sourceNow = (await loadPropuestaSources(tx as Prisma.TransactionClient, [proposal.sucursalId], proposal.fecha.toISOString().slice(0, 10))).get(proposal.sucursalId)!;
    const obsoleta = propuestaObsoleta(proposal, sourceNow);
    return {
      id: proposal.id, sucursalId: proposal.sucursalId, sucursal: proposal.sucursal,
      fecha: proposal.fecha.toISOString().slice(0, 10), timezone: this.timezone, version: proposal.version,
      estado: proposal.estado, obsoleta,
      fuente: { reporteId: proposal.fuenteReporteId, fecha: proposal.fuenteFecha?.toISOString().slice(0, 10) ?? null, turno: proposal.fuenteTurno, confirmadoAt: proposal.fuenteConfirmadoAt },
      creadaAt: proposal.creadaAt, confirmadaAt: proposal.confirmadaAt,
      detalles: proposal.detalles.map((item) => ({ saborId: item.saborId, sabor: item.sabor.nombre, saborActivo: item.sabor.activo,
        estadoReferencia: item.estadoReferencia, objetivoLitros: item.objetivoLitros?.toString() ?? null, objetivoActualizadoAt: item.objetivoActualizadoAt,
        existenciaLitros: item.existenciaLitros?.toString() ?? null, sugerenciaLitros: item.sugerenciaLitros?.toString() ?? null,
        decisionLitros: item.decisionLitros?.toString() ?? null })),
    };
  }

  async listar(fecha: string) {
    const normalized = this.date(fecha).fecha;
    const proposals = await this.prisma.propuestaAbastecimiento.findMany({ where: { fecha: new Date(`${normalized}T00:00:00.000Z`) }, orderBy: [{ fecha: 'desc' }, { sucursalId: 'asc' }, { version: 'desc' }], select: { id: true, sucursalId: true, fecha: true } });
    const latest = new Map<string, number>();
    for (const proposal of proposals) {
      const key = `${proposal.sucursalId}:${proposal.fecha.toISOString().slice(0, 10)}`;
      if (!latest.has(key)) latest.set(key, proposal.id);
    }
    const rows = await Promise.all([...latest.values()].map((id) => this.get(id)));
    return { timezone: this.timezone, propuestas: rows };
  }

  async get(id: number) { return this.serialize(this.prisma, id); }

  async crear(sucursalId: number, fechaValue: string) {
    const fecha = this.date(fechaValue).fecha;
    const day = new Date(`${fecha}T00:00:00.000Z`);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT "id" FROM "Sucursal" WHERE "id" = ${sucursalId} FOR UPDATE`);
        if (!locked.length) throw new NotFoundException('Sucursal no encontrada');
        const branch = await tx.sucursal.findUniqueOrThrow({ where: { id: sucursalId } });
        if (!branch.activo) throw new BadRequestException('No se pueden crear propuestas para una sucursal inactiva');
        const latest = await tx.propuestaAbastecimiento.findFirst({ where: { sucursalId, fecha: day }, orderBy: { version: 'desc' } });
        if (latest?.estado === EstadoPropuestaAbastecimiento.BORRADOR) throw new ConflictException('Ya existe un borrador; edítalo o recalcula su fuente');
        const next = (await loadPropuestaSources(tx, [sucursalId], fecha)).get(sucursalId)!;
        const proposal = await tx.propuestaAbastecimiento.create({ data: { sucursalId, fecha: day, version: (latest?.version ?? 0) + 1, fuenteReporteId: next.report?.id ?? null, fuenteFecha: next.report?.fecha ?? null, fuenteTurno: next.report?.turno ?? null, fuenteConfirmadoAt: next.report?.confirmadoAt ?? null, detalles: { create: next.details } } });
        return proposal.id;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return this.get(id);
    } catch (error) { this.translateConflict(error); }
  }

  async decidir(id: number, decisions: { saborId: number; decisionLitros: string | null }[]) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const proposal = await tx.propuestaAbastecimiento.findUnique({ where: { id }, select: { sucursalId: true, estado: true } });
        if (!proposal) throw new NotFoundException('Propuesta no encontrada');
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Sucursal" WHERE "id" = ${proposal.sucursalId} FOR UPDATE`);
        const locked = await tx.propuestaAbastecimiento.findUniqueOrThrow({ where: { id } });
        if (locked.estado !== EstadoPropuestaAbastecimiento.BORRADOR) throw new ConflictException('La propuesta confirmada es inmutable');
        const latest = await tx.propuestaAbastecimiento.findFirst({ where: { sucursalId: proposal.sucursalId, fecha: locked.fecha }, orderBy: { version: 'desc' } });
        if (latest?.id !== id) throw new ConflictException('Existe una versión posterior de esta propuesta');
        const stale = await this.serialize(tx, id) as { obsoleta: boolean };
        if (stale.obsoleta) throw new ConflictException('La fuente cambió; recalcula la propuesta antes de editarla');
        const details = await tx.detallePropuestaAbastecimiento.findMany({ where: { propuestaId: id }, include: { sabor: { select: { activo: true } } } });
        const byFlavor = new Map(details.map((item) => [item.saborId, item]));
        for (const item of decisions) {
          const detail = byFlavor.get(item.saborId);
          if (!detail) throw new NotFoundException('Sabor no incluido en la propuesta');
          if (!detail.sabor.activo) throw new BadRequestException('No se pueden cambiar decisiones de sabores inactivos');
        }
        for (const item of decisions) await tx.detallePropuestaAbastecimiento.update({ where: { propuestaId_saborId: { propuestaId: id, saborId: item.saborId } }, data: { decisionLitros: item.decisionLitros === null ? null : new Prisma.Decimal(item.decisionLitros) } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return this.get(id);
    } catch (error) { this.translateConflict(error); }
  }

  async recalcular(id: number) {
    try {
      const nextId = await this.prisma.$transaction(async (tx) => {
        const proposal = await tx.propuestaAbastecimiento.findUnique({ where: { id } });
        if (!proposal) throw new NotFoundException('Propuesta no encontrada');
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Sucursal" WHERE "id" = ${proposal.sucursalId} FOR UPDATE`);
        if (proposal.estado !== EstadoPropuestaAbastecimiento.BORRADOR) throw new ConflictException('Solo un borrador puede recalcularse');
        const latest = await tx.propuestaAbastecimiento.findFirst({ where: { sucursalId: proposal.sucursalId, fecha: proposal.fecha }, orderBy: { version: 'desc' } });
        if (!latest || latest.id !== id) throw new ConflictException('Solo la versión más reciente puede recalcularse');
        const stale = await this.serialize(tx, id) as { obsoleta: boolean };
        if (!stale.obsoleta) throw new ConflictException('La fuente no cambió; no es necesario recalcular');
        const source = (await loadPropuestaSources(tx, [proposal.sucursalId], proposal.fecha.toISOString().slice(0, 10))).get(proposal.sucursalId)!;
        const next = await tx.propuestaAbastecimiento.create({ data: { sucursalId: proposal.sucursalId, fecha: proposal.fecha, version: proposal.version + 1, fuenteReporteId: source.report?.id ?? null, fuenteFecha: source.report?.fecha ?? null, fuenteTurno: source.report?.turno ?? null, fuenteConfirmadoAt: source.report?.confirmadoAt ?? null, detalles: { create: source.details } } });
        return next.id;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return this.get(nextId);
    } catch (error) { this.translateConflict(error); }
  }

  async confirmar(id: number) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const proposal = await tx.propuestaAbastecimiento.findUnique({ where: { id } });
        if (!proposal) throw new NotFoundException('Propuesta no encontrada');
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Sucursal" WHERE "id" = ${proposal.sucursalId} FOR UPDATE`);
        const locked = await tx.propuestaAbastecimiento.findUniqueOrThrow({ where: { id } });
        if (locked.estado !== EstadoPropuestaAbastecimiento.BORRADOR) throw new ConflictException('La propuesta ya está confirmada y es inmutable');
        const latest = await tx.propuestaAbastecimiento.findFirst({ where: { sucursalId: proposal.sucursalId, fecha: proposal.fecha }, orderBy: { version: 'desc' } });
        if (!latest || latest.id !== id) throw new ConflictException('Existe una versión posterior de esta propuesta');
        const snapshot = await this.serialize(tx, id) as { obsoleta: boolean };
        if (snapshot.obsoleta) throw new ConflictException('La fuente cambió; revisa y recalcula la propuesta antes de confirmar');
        const details = await tx.detallePropuestaAbastecimiento.findMany({ where: { propuestaId: id }, include: { sabor: { select: { activo: true } } } });
        if (!details.length || details.some((item) => item.sabor.activo && item.decisionLitros === null)) throw new BadRequestException('Define explícitamente una cantidad para cada sabor activo antes de confirmar');
        await tx.propuestaAbastecimiento.update({ where: { id }, data: { estado: EstadoPropuestaAbastecimiento.CONFIRMADA, confirmadaAt: new Date() } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return this.get(id);
    } catch (error) { this.translateConflict(error); }
  }

  private translateConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException('La propuesta cambió durante la operación; vuelve a cargarla');
    throw error;
  }
}
