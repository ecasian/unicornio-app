import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service.js';
import { businessCalendarDaysBetween, DEFAULT_BUSINESS_TIMEZONE, resolveBusinessDate } from '../produccion/business-date.js';
import { AcondicionarDto, CrearLoteDto } from './dto.js';

const loteInclude = { acondicionamientos: { include: { sabor: { select: { id: true, nombre: true } } }, orderBy: { createdAt: 'asc' as const } } };
const decimalNumber = (value: Prisma.Decimal) => Number(value.toString());

export type EstadoTemporalLote = 'PROCESADO' | 'PROCESAMIENTO_NORMAL' | 'PROCESAMIENTO_OBLIGATORIO' | 'LIMITE_EXCEDIDO_REQUIERE_REVISION';

export function clasificarEstadoTemporalLote(ageDays: number, litrosRestantes: number): EstadoTemporalLote {
  if (litrosRestantes <= 0) return 'PROCESADO';
  if (ageDays >= 3) return 'LIMITE_EXCEDIDO_REQUIERE_REVISION';
  if (ageDays === 2) return 'PROCESAMIENTO_OBLIGATORIO';
  return 'PROCESAMIENTO_NORMAL';
}

@Injectable()
export class YogurtBaseService {
  private readonly timezone: string;
  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    this.timezone = config.get<string>('BUSINESS_TIMEZONE')?.trim() || DEFAULT_BUSINESS_TIMEZONE;
  }

  private businessDate(fecha?: string) {
    try { return resolveBusinessDate(fecha, this.timezone, new Date(), 'today'); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Fecha inválida'); }
  }

  async list(fecha?: string) {
    const window = this.businessDate(fecha);
    const lots = await this.prisma.loteYogurtBase.findMany({
      where: { fechaElaboracion: { lt: window.end } }, include: loteInclude,
      orderBy: [{ fechaElaboracion: 'asc' }, { id: 'asc' }],
    });
    const lotes = lots.map((lot) => {
      const consumidos = lot.acondicionamientos.reduce((sum, row) => sum + decimalNumber(row.litrosConsumidos), 0);
      const preparados = lot.acondicionamientos.reduce((sum, row) => sum + decimalNumber(row.litrosObtenidos), 0);
      const litrosReales = decimalNumber(lot.litrosReales);
      const remaining = Math.max(0, Number((litrosReales - consumidos).toFixed(3)));
      const ageDays = businessCalendarDaysBetween(lot.fechaElaboracion.toISOString().slice(0, 10), window.fecha);
      const estadoTemporal = clasificarEstadoTemporalLote(ageDays, remaining);
      return {
        id: lot.id, fechaElaboracion: lot.fechaElaboracion.toISOString().slice(0, 10),
        cubetas: { '10L': lot.cubetas10L, '6L': lot.cubetas6L, '4L': lot.cubetas4L },
        litrosEquivalentes: lot.cubetas10L * 10 + lot.cubetas6L * 6 + lot.cubetas4L * 4,
        litrosReales, litrosConsumidos: Number(consumidos.toFixed(3)), litrosRestantes: remaining,
        litrosObtenidos: Number(preparados.toFixed(3)), edadCalendarioDias: ageDays, estadoTemporal,
        alertaPrioritaria: remaining > 0 && ageDays === 2,
        requiereRevisionPorLimite: remaining > 0 && ageDays >= 3,
        acondicionamientos: lot.acondicionamientos.map((row) => ({ id: row.id, saborId: row.saborId, sabor: row.sabor.nombre, litrosConsumidos: decimalNumber(row.litrosConsumidos), litrosObtenidos: decimalNumber(row.litrosObtenidos), diferenciaRendimiento: Number((decimalNumber(row.litrosObtenidos) - decimalNumber(row.litrosConsumidos)).toFixed(3)), createdAt: row.createdAt })),
      };
    });
    const [sabores, referencia] = await Promise.all([
      this.prisma.sabor.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }).then((items) => items.filter((item) => item.nombre.trim().toLocaleLowerCase('es') !== 'natural')),
      this.prisma.concentradoSucursales.findUnique({ where: { fecha: new Date(`${window.fecha}T00:00:00.000Z`) }, include: { necesidades: { where: { estado: 'CONFIRMADO' }, include: { detalles: { include: { sabor: { select: { id: true, nombre: true } } } } } } } }),
    ]);
    const necesidadesReferencia = (referencia?.necesidades ?? []).flatMap((n) => n.detalles.map((d) => ({ saborId: d.saborId, sabor: d.sabor.nombre, capacidadLitros: d.capacidadLitros, cantidad: d.cantidad, litrosReferencia: d.cantidad * d.capacidadLitros })));
    return { fecha: window.fecha, timezone: window.timezone, reglasPendientes: ['El rendimiento esperado y la precisión del instrumento de medición requieren confirmación; se conservan litros con precisión de 0.001 L y no se aplica merma automática.'], lotes, resumen: { litrosBaseDisponibles: Number(lotes.reduce((sum, lot) => sum + lot.litrosRestantes, 0).toFixed(3)), litrosBaseProcesados: Number(lotes.reduce((sum, lot) => sum + lot.litrosConsumidos, 0).toFixed(3)), litrosAcondicionadosObtenidos: Number(lotes.reduce((sum, lot) => sum + lot.litrosObtenidos, 0).toFixed(3)) }, saboresDestino: sabores, necesidadesSucursalReferencia: necesidadesReferencia };
  }

  async createLot(data: CrearLoteDto) {
    const date = this.parseDate(data.fechaElaboracion);
    if (data.cubetas10L + data.cubetas6L + data.cubetas4L < 1) throw new BadRequestException('Registra al menos una cubeta de 10, 6 o 4 litros');
    return this.prisma.loteYogurtBase.create({ data: { fechaElaboracion: date, cubetas10L: data.cubetas10L, cubetas6L: data.cubetas6L, cubetas4L: data.cubetas4L, litrosReales: new Prisma.Decimal(data.litrosReales) } });
  }

  async condition(data: AcondicionarDto) {
    const prior = await this.prisma.acondicionamientoYogurtBase.findUnique({ where: { claveSolicitud: data.claveSolicitud } });
    if (prior) return this.idempotentResponse(prior, data);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT "id" FROM "LoteYogurtBase" WHERE "id" = ${data.loteId} FOR UPDATE`);
        if (!locked.length) throw new NotFoundException('Lote de YogurtBase no encontrado');
        const [lot, sabor, existing] = await Promise.all([
          tx.loteYogurtBase.findUniqueOrThrow({ where: { id: data.loteId } }),
          tx.sabor.findUnique({ where: { id: data.saborId } }),
          tx.acondicionamientoYogurtBase.findUnique({ where: { claveSolicitud: data.claveSolicitud } }),
        ]);
        if (existing) return this.idempotentResponse(existing, data);
        if (!sabor || !sabor.activo || sabor.nombre.trim().toLocaleLowerCase('es') === 'natural') throw new BadRequestException('Selecciona un sabor destino activo distinto de Natural');
        const totals = await tx.acondicionamientoYogurtBase.aggregate({ where: { loteId: lot.id }, _sum: { litrosConsumidos: true } });
        const available = Number(lot.litrosReales.minus(totals._sum.litrosConsumidos ?? new Prisma.Decimal(0)).toFixed(3));
        if (data.litrosConsumidos > available) throw new ConflictException(`Volumen excede la base disponible (${available} L)`);
        const movement = await tx.acondicionamientoYogurtBase.create({ data: { loteId: lot.id, saborId: sabor.id, claveSolicitud: data.claveSolicitud, litrosConsumidos: new Prisma.Decimal(data.litrosConsumidos), litrosObtenidos: new Prisma.Decimal(data.litrosObtenidos) } });
        return this.movementResponse(movement);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const prior = await this.prisma.acondicionamientoYogurtBase.findUnique({ where: { claveSolicitud: data.claveSolicitud } });
        if (prior) return this.idempotentResponse(prior, data);
        throw new ConflictException('El movimiento ya fue procesado; recarga los lotes');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException('El lote cambió durante la operación; recarga e intenta de nuevo');
      throw error;
    }
  }

  private movementResponse(row: { id: number; loteId: number; saborId: number; litrosConsumidos: Prisma.Decimal; litrosObtenidos: Prisma.Decimal; createdAt: Date }) {
    return { id: row.id, loteId: row.loteId, saborId: row.saborId, litrosConsumidos: decimalNumber(row.litrosConsumidos), litrosObtenidos: decimalNumber(row.litrosObtenidos), diferenciaRendimiento: Number((decimalNumber(row.litrosObtenidos) - decimalNumber(row.litrosConsumidos)).toFixed(3)), createdAt: row.createdAt };
  }

  private idempotentResponse(row: { id: number; loteId: number; saborId: number; litrosConsumidos: Prisma.Decimal; litrosObtenidos: Prisma.Decimal; createdAt: Date }, data: AcondicionarDto) {
    if (row.loteId !== data.loteId || row.saborId !== data.saborId || !row.litrosConsumidos.equals(new Prisma.Decimal(data.litrosConsumidos)) || !row.litrosObtenidos.equals(new Prisma.Decimal(data.litrosObtenidos))) {
      throw new ConflictException('La clave de solicitud ya se usó con otros datos');
    }
    return this.movementResponse(row);
  }

  private parseDate(value: string) {
    try { this.businessDate(value); return new Date(`${value}T00:00:00.000Z`); }
    catch (error) { throw error instanceof BadRequestException ? error : new BadRequestException('Fecha inválida'); }
  }
}
