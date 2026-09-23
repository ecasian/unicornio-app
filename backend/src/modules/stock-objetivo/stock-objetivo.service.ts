import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service.js';
import { ReplaceStockObjetivoDto } from './dto/replace-stock-objetivo.dto.js';

const details = {
  sabor: { select: { id: true, nombre: true, activo: true } },
  presentacion: { select: { id: true, nombre: true, litrosEquivalentes: true } },
} as const;

// Espacio de claves de dos enteros: el segundo es el ID del cliente.
export const STOCK_OBJETIVO_LOCK_NAMESPACE = 1398034243;

@Injectable()
export class StockObjetivoService {
  constructor(private readonly prisma: PrismaService) {}

  async get(clienteId: number) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    return this.prisma.stockObjetivo.findMany({
      where: { clienteId },
      include: details,
      orderBy: [{ saborId: 'asc' }, { presentacionId: 'asc' }],
    });
  }

  async replace(clienteId: number, data: ReplaceStockObjetivoDto) {
    const keys = data.combinaciones.map(({ saborId, presentacionId }) => `${saborId}:${presentacionId}`);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('No repitas una combinación de sabor y presentación');
    }

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${STOCK_OBJETIVO_LOCK_NAMESPACE}::integer, ${clienteId}::integer)`;
      const cliente = await transaction.cliente.findUnique({ where: { id: clienteId } });
      if (!cliente) throw new NotFoundException('Cliente no encontrado');
      if (!cliente.activo) throw new BadRequestException('El cliente está inactivo');

      const saborIds = [...new Set(data.combinaciones.map((item) => item.saborId))];
      const sabores = await transaction.sabor.findMany({ where: { id: { in: saborIds } } });
      const relaciones = await transaction.saborPresentacion.findMany({
        where: { saborId: { in: saborIds } },
        include: { presentacion: true },
      });

      for (const { saborId, presentacionId } of data.combinaciones) {
        const sabor = sabores.find((item) => item.id === saborId);
        if (!sabor) throw new NotFoundException(`Sabor ${saborId} no encontrado`);
        if (!sabor.activo) throw new BadRequestException(`El sabor ${sabor.nombre} está inactivo`);
        const relacion = relaciones.find((item) => item.saborId === saborId && item.presentacionId === presentacionId);
        if (!relacion?.habilitada) throw new BadRequestException('La presentación no está habilitada para el sabor');
        if (relacion.presentacion.litrosEquivalentes === 0.5 && !cliente.manejaMedioLitro) {
          throw new BadRequestException('El cliente no maneja 1/2 litro');
        }
      }

      const included = data.combinaciones.map(({ saborId, presentacionId }) => ({ saborId, presentacionId }));
      await transaction.stockObjetivo.deleteMany({
        where: { clienteId, ...(included.length ? { NOT: { OR: included } } : {}) },
      });
      for (const { saborId, presentacionId, cantidad } of data.combinaciones) {
        await transaction.stockObjetivo.upsert({
          where: { clienteId_saborId_presentacionId: { clienteId, saborId, presentacionId } },
          create: { clienteId, saborId, presentacionId, cantidad },
          update: { cantidad },
        });
      }
      return transaction.stockObjetivo.findMany({
        where: { clienteId },
        include: details,
        orderBy: [{ saborId: 'asc' }, { presentacionId: 'asc' }],
      });
    }, { maxWait: 15000, timeout: 15000 });
  }
}
