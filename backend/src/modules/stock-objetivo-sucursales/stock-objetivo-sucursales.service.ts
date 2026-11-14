import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoInventarioSucursal, Prisma, TurnoInventarioSucursal } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service.js';
import { recordMutationSucceededInTransaction } from '../auth/audit-transaction.js';
import { resolveBusinessDate, DEFAULT_BUSINESS_TIMEZONE } from '../produccion/business-date.js';
import { ReemplazarStockObjetivoSucursalDto } from './dto.js';

const includeSabor = { sabor: { select: { id: true, nombre: true, activo: true } } } as const;
const litrosPattern = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;

@Injectable()
export class StockObjetivoSucursalesService {
  private readonly timezone: string;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    this.timezone = config.get<string>('BUSINESS_TIMEZONE')?.trim() || DEFAULT_BUSINESS_TIMEZONE;
  }

  private async requireSucursal(id: number) {
    const sucursal = await this.prisma.sucursal.findUnique({ where: { id }, select: { id: true, nombre: true, activo: true } });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    return sucursal;
  }

  async get(sucursalId: number) {
    const sucursal = await this.requireSucursal(sucursalId);
    const objetivos = await this.prisma.stockObjetivoSucursal.findMany({ where: { sucursalId }, include: includeSabor, orderBy: { saborId: 'asc' } });
    return { sucursal, objetivos: objetivos.map(({ saborId, sabor, litros, createdAt, updatedAt }) => ({ saborId, sabor: sabor.nombre, saborActivo: sabor.activo, litros: litros.toString(), createdAt, updatedAt })) };
  }

  async replace(sucursalId: number, data: ReemplazarStockObjetivoSucursalDto) {
    if (!Array.isArray(data.objetivos)) throw new BadRequestException('objetivos debe ser una lista completa');
    const ids = new Set<number>();
    for (const item of data.objetivos) {
      if (!Number.isInteger(item.saborId) || item.saborId <= 0 || typeof item.litros !== 'string' || !litrosPattern.test(item.litros)) {
        throw new BadRequestException('Cada objetivo requiere un sabor y litros decimales no negativos de hasta tres posiciones y máximo 11 enteros');
      }
      if (ids.has(item.saborId)) throw new BadRequestException('No repitas sabores en los objetivos');
      ids.add(item.saborId);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT "id" FROM "Sucursal" WHERE "id" = ${sucursalId} FOR UPDATE`);
        if (!locked.length) throw new NotFoundException('Sucursal no encontrada');
        const sucursal = await tx.sucursal.findUniqueOrThrow({ where: { id: sucursalId } });
        if (!sucursal.activo) throw new BadRequestException('No se pueden modificar objetivos de una sucursal inactiva');

        const existing = await tx.stockObjetivoSucursal.findMany({ where: { sucursalId } });
        const existingByFlavor = new Map(existing.map((item) => [item.saborId, item]));
        const requestedIds = [...ids];
        const validationIds = [...new Set([...requestedIds, ...existing.map((item) => item.saborId)])];
        const flavors = validationIds.length ? await tx.sabor.findMany({ where: { id: { in: validationIds } }, select: { id: true, activo: true } }) : [];
        const flavorById = new Map(flavors.map((flavor) => [flavor.id, flavor]));
        for (const id of requestedIds) if (!flavorById.has(id)) throw new BadRequestException(`El sabor ${id} no existe`);

        for (const previous of existing) {
          const flavor = flavorById.get(previous.saborId);
          if (!flavor) throw new BadRequestException(`El sabor ${previous.saborId} asociado a un objetivo ya no existe`);
          const next = data.objetivos.find((item) => item.saborId === previous.saborId);
          if (!flavor.activo && (!next || !previous.litros.equals(new Prisma.Decimal(next.litros)))) {
            throw new BadRequestException(`Conserva sin cambios el objetivo existente del sabor inactivo ${previous.saborId}`);
          }
        }
        for (const item of data.objetivos) {
          const flavor = flavorById.get(item.saborId)!;
          if (!flavor.activo && !existingByFlavor.has(item.saborId)) throw new BadRequestException(`No se puede configurar un sabor inactivo (${item.saborId})`);
        }

        const inactiveExistingIds = existing.filter((item) => !flavorById.get(item.saborId)?.activo).map((item) => item.saborId);

        const removableIds = existing.filter((item) => !inactiveExistingIds.includes(item.saborId) && !ids.has(item.saborId)).map((item) => item.saborId);
        if (removableIds.length) await tx.stockObjetivoSucursal.deleteMany({ where: { sucursalId, saborId: { in: removableIds } } });
        for (const item of data.objetivos) {
          const previous = existingByFlavor.get(item.saborId);
          if (previous && !flavorById.get(item.saborId)?.activo) continue;
          await tx.stockObjetivoSucursal.upsert({
            where: { sucursalId_saborId: { sucursalId, saborId: item.saborId } },
            create: { sucursalId, saborId: item.saborId, litros: new Prisma.Decimal(item.litros) },
            update: { litros: new Prisma.Decimal(item.litros) },
          });
        }
        const objetivos = await tx.stockObjetivoSucursal.findMany({ where: { sucursalId }, include: includeSabor, orderBy: { saborId: 'asc' } });
        const result = { sucursal: { id: sucursal.id, nombre: sucursal.nombre, activo: sucursal.activo }, objetivos: objetivos.map(({ saborId, sabor, litros, createdAt, updatedAt }) => ({ saborId, sabor: sabor.nombre, saborActivo: sabor.activo, litros: litros.toString(), createdAt, updatedAt })) };
        await recordMutationSucceededInTransaction(tx);
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
        throw new ConflictException('Los objetivos cambiaron durante la operación; vuelve a cargar antes de guardar');
      }
      throw error;
    }
  }

  async compare(sucursalId: number, fecha: string, turno: TurnoInventarioSucursal) {
    let window;
    try { window = resolveBusinessDate(fecha, this.timezone, new Date(), 'today'); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Fecha inválida'); }
    const sucursal = await this.requireSucursal(sucursalId);
    const day = new Date(`${window.fecha}T00:00:00.000Z`);
    const [objetivos, activeFlavors, report] = await Promise.all([
      this.prisma.stockObjetivoSucursal.findMany({ where: { sucursalId }, include: includeSabor, orderBy: { saborId: 'asc' } }),
      this.prisma.sabor.findMany({ where: { activo: true }, select: { id: true, nombre: true, activo: true }, orderBy: { nombre: 'asc' } }),
      this.prisma.reporteInventarioSucursal.findUnique({
        where: { sucursalId_fecha_turno: { sucursalId, fecha: day, turno } },
        include: { detalles: { include: { sabor: { select: { id: true, nombre: true, activo: true } } }, orderBy: { saborId: 'asc' } } },
      }),
    ]);
    const objectiveByFlavor = new Map(objetivos.map((item) => [item.saborId, { name: item.sabor.nombre, active: item.sabor.activo, liters: item.litros }]));
    const existenceByFlavor = new Map((report?.estado === EstadoInventarioSucursal.CONFIRMADO ? report.detalles : []).map((item) => [item.saborId, { name: item.sabor.nombre, active: item.sabor.activo, liters: item.litros }]));
    const flavors = new Map<number, { id: number; nombre: string; activo: boolean }>();
    for (const flavor of activeFlavors) flavors.set(flavor.id, flavor);
    for (const [id, flavor] of objectiveByFlavor) flavors.set(id, { id, nombre: flavor.name, activo: flavor.active });
    for (const [id, flavor] of existenceByFlavor) flavors.set(id, { id, nombre: flavor.name, activo: flavor.active });

    const comparaciones = [...flavors.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((flavor) => {
      const objective = objectiveByFlavor.get(flavor.id)?.liters;
      const existence = existenceByFlavor.get(flavor.id)?.liters;
      return {
        saborId: flavor.id,
        sabor: flavor.nombre,
        saborActivo: flavor.activo,
        objetivoConfigurado: objective !== undefined,
        objetivoLitros: objective?.toString() ?? null,
        existenciaRegistrada: existence !== undefined,
        existenciaLitros: existence?.toString() ?? null,
        diferenciaLitros: objective !== undefined && existence !== undefined ? objective.minus(existence).toString() : null,
      };
    });
    return {
      sucursal,
      fecha: window.fecha,
      timezone: window.timezone,
      turno,
      inventarioEstado: report?.estado ?? 'AUSENTE',
      inventarioId: report?.estado === EstadoInventarioSucursal.CONFIRMADO ? report.id : null,
      comparaciones,
    };
  }
}
