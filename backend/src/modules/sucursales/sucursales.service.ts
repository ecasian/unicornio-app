import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, EstadoConcentradoSucursal } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service.js';
import { recordMutationSucceededInTransaction } from '../auth/audit-transaction.js';
import { GuardarNecesidadDto } from './dto/necesidad.dto.js';
import { SucursalDto, UpdateSucursalDto } from './dto/sucursal.dto.js';
import { DEFAULT_BUSINESS_TIMEZONE, resolveBusinessDate } from '../produccion/business-date.js';

const dayStart = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('fecha debe tener formato YYYY-MM-DD');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('fecha inválida');
  return date;
};

@Injectable()
export class SucursalesService {
  private readonly timezone: string;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    this.timezone = config.get<string>('BUSINESS_TIMEZONE')?.trim() || DEFAULT_BUSINESS_TIMEZONE;
  }

  private async withConflictHandling<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') {
        throw new ConflictException('El reporte cambió durante la operación; vuelve a cargarlo e intenta de nuevo');
      }
      throw error;
    }
  }

  listSucursales() { return this.prisma.sucursal.findMany({ orderBy: { id: 'asc' } }); }
  listSabores() { return this.prisma.sabor.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }); }
  async createSucursal(data: SucursalDto) {
    const nombre = data.nombre.trim();
    if (!nombre) throw new BadRequestException('nombre no debe estar vacío');
    return this.prisma.sucursal.create({ data: { nombre } });
  }
  async updateSucursal(id: number, data: UpdateSucursalDto) {
    if (!await this.prisma.sucursal.findUnique({ where: { id } })) throw new NotFoundException('Sucursal no encontrada');
    const nombre = data.nombre?.trim();
    if (data.nombre !== undefined && !nombre) throw new BadRequestException('nombre no debe estar vacío');
    return this.prisma.sucursal.update({ where: { id }, data: { ...data, nombre } });
  }

  async guardarNecesidad(sucursalId: number, data: GuardarNecesidadDto) {
    const fecha = dayStart(data.fecha);
    if (!Array.isArray(data.detalles)) throw new BadRequestException('detalles debe ser una lista');
    const allowedCapacities = new Set([4, 6, 10]);
    const keys = new Set<string>();
    for (const item of data.detalles) {
      if (!Number.isInteger(item.saborId) || item.saborId <= 0 || !Number.isInteger(item.cantidad) || item.cantidad < 0 || !allowedCapacities.has(item.capacidadLitros)) throw new BadRequestException('Cada renglón requiere sabor activo, capacidad 4/6/10 y cantidad entera no negativa');
      const key = `${item.saborId}:${item.capacidadLitros}`;
      if (keys.has(key)) throw new BadRequestException('No repitas combinaciones de sabor y capacidad');
      keys.add(key);
    }
    return this.withConflictHandling(() => this.prisma.$transaction(async (tx) => {
      const sucursal = await tx.sucursal.findUnique({ where: { id: sucursalId } });
      if (!sucursal || !sucursal.activo) throw new NotFoundException('Sucursal activa no encontrada');
      const sabores = await tx.sabor.findMany({ where: { id: { in: [...new Set(data.detalles.map((item) => item.saborId))] }, activo: true }, select: { id: true } });
      if (sabores.length !== new Set(data.detalles.map((item) => item.saborId)).size) throw new BadRequestException('Todos los sabores deben existir y estar activos');
      const concentrado = await tx.concentradoSucursales.upsert({ where: { fecha }, create: { fecha }, update: {} });
      let necesidad = await tx.necesidadSucursal.findUnique({ where: { concentradoId_sucursalId: { concentradoId: concentrado.id, sucursalId } } });
      if (necesidad?.estado === EstadoConcentradoSucursal.CONFIRMADO) throw new ConflictException('El concentrado de esta sucursal ya está confirmado para la fecha');
      if (!necesidad) necesidad = await tx.necesidadSucursal.create({ data: { concentradoId: concentrado.id, sucursalId } });
      await tx.detalleNecesidadSucursal.deleteMany({ where: { necesidadSucursalId: necesidad.id } });
      await tx.detalleNecesidadSucursal.createMany({ data: data.detalles.map((item) => ({ necesidadSucursalId: necesidad.id, ...item })) });
      const result = await tx.necesidadSucursal.findUniqueOrThrow({ where: { id: necesidad.id }, include: { sucursal: true, detalles: { include: { sabor: true }, orderBy: [{ saborId: 'asc' }, { capacidadLitros: 'asc' }] } } });
      await recordMutationSucceededInTransaction(tx);
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async confirmar(sucursalId: number, fechaStr: string) {
    const fecha = dayStart(fechaStr);
    const concentrado = await this.prisma.concentradoSucursales.findUnique({ where: { fecha } });
    if (!concentrado) throw new NotFoundException('No hay un borrador para esta fecha');
    const report = await this.prisma.necesidadSucursal.findUnique({ where: { concentradoId_sucursalId: { concentradoId: concentrado.id, sucursalId } }, include: { detalles: true } });
    if (!report) throw new NotFoundException('Guarda un borrador antes de confirmar');
    if (report.estado === EstadoConcentradoSucursal.CONFIRMADO) throw new ConflictException('Este reporte ya está confirmado');
    if (report.detalles.length === 0) throw new BadRequestException('Agrega al menos una combinación, con cantidad explícita incluso si es cero');
    return this.withConflictHandling(() => this.prisma.$transaction(async (tx) => {
      const locked = await tx.necesidadSucursal.findUnique({ where: { id: report.id } });
      if (!locked || locked.estado === EstadoConcentradoSucursal.CONFIRMADO) throw new ConflictException('Este reporte ya está confirmado');
      const result = await tx.necesidadSucursal.update({ where: { id: report.id }, data: { estado: EstadoConcentradoSucursal.CONFIRMADO, confirmadoAt: new Date() }, include: { sucursal: true, detalles: { include: { sabor: true } } } });
      await recordMutationSucceededInTransaction(tx);
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async consultar(fechaStr?: string) {
    let window;
    try {
      window = resolveBusinessDate(fechaStr, this.timezone, new Date(), 'today');
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Fecha o zona horaria inválida');
    }
    const fecha = dayStart(window.fecha);
    const [sucursales, concentrado] = await Promise.all([
      this.prisma.sucursal.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.concentradoSucursales.findUnique({
        where: { fecha },
        include: {
          necesidades: {
            where: { estado: EstadoConcentradoSucursal.CONFIRMADO },
            include: {
              sucursal: true,
              detalles: {
                include: { sabor: true },
                orderBy: [{ saborId: 'asc' }, { capacidadLitros: 'asc' }],
              },
            },
            orderBy: { sucursalId: 'asc' },
          },
        },
      }),
    ]);
    const reportes = concentrado?.necesidades ?? [];
    const consolidado = new Map<string, { saborId: number; sabor: string; capacidadLitros: number; cantidad: number; litrosEquivalentes: number }>();
    for (const reporte of reportes) for (const detalle of reporte.detalles) {
      const key = `${detalle.saborId}:${detalle.capacidadLitros}`;
      const value = consolidado.get(key) ?? { saborId: detalle.saborId, sabor: detalle.sabor.nombre, capacidadLitros: detalle.capacidadLitros, cantidad: 0, litrosEquivalentes: 0 };
      value.cantidad += detalle.cantidad;
      value.litrosEquivalentes += detalle.cantidad * detalle.capacidadLitros;
      consolidado.set(key, value);
    }
    return { fecha: window.fecha, timezone: window.timezone, sucursalesSinConfirmar: sucursales.filter((item) => !reportes.some((report) => report.sucursalId === item.id)).map(({ id, nombre, activo }) => ({ id, nombre, activo })), sucursales: reportes.map((item) => ({ sucursalId: item.sucursalId, sucursal: item.sucursal.nombre, estado: item.estado, confirmadoAt: item.confirmadoAt, detalles: item.detalles.map((detail) => ({ saborId: detail.saborId, sabor: detail.sabor.nombre, capacidadLitros: detail.capacidadLitros, cantidad: detail.cantidad, litrosEquivalentes: detail.cantidad * detail.capacidadLitros })) })), consolidado: [...consolidado.values()].sort((a, b) => a.sabor.localeCompare(b.sabor) || a.capacidadLitros - b.capacidadLitros) };
  }
}
