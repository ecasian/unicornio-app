import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoPedidoProduccion, Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service.js';
import { DEFAULT_BUSINESS_TIMEZONE, resolveBusinessDate } from './business-date.js';

const pedidoInclude = {
  cliente: { select: { id: true, nombre: true } },
  repartidor: { select: { id: true, nombre: true } },
  registroExistencias: {
    select: { id: true, visitaClienteId: true, corregidoPor: { select: { id: true } }, visitaCliente: { select: { llegadaAt: true } } },
  },
  detalles: {
    select: {
      saborId: true, presentacionId: true, cantidadSolicitada: true,
      sabor: { select: { nombre: true } }, presentacion: { select: { nombre: true } },
    },
    orderBy: [{ saborId: 'asc' }, { presentacionId: 'asc' }],
  },
} satisfies Prisma.PedidoProduccionInclude;

type Pedido = Prisma.PedidoProduccionGetPayload<{ include: typeof pedidoInclude }>;
type Product = { saborId: number; sabor: string; presentacionId: number; presentacion: string; cantidad: number };

@Injectable()
export class ProduccionService {
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
      window = resolveBusinessDate(fecha, this.timezone);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Fecha o zona horaria inválida');
    }

    return this.prisma.$transaction(async (tx) => {
      const pedidos = await tx.pedidoProduccion.findMany({
        where: {
          estado: EstadoPedidoProduccion.VIGENTE,
          registroExistencias: {
            is: {
              corregidoPor: { is: null },
              visitaCliente: { is: { llegadaAt: { gte: window.start, lt: window.end } } },
            },
          },
        },
        include: pedidoInclude,
      });
      return this.toResponse(window.fecha, window.timezone, pedidos);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private toResponse(fecha: string, timezone: string, pedidos: Pedido[]) {
    const tiendaMap = new Map<number, { clienteId: number; cliente: string; pedidos: Array<Record<string, unknown>> }>();
    const consolidadoMap = new Map<string, Product>();

    for (const pedido of pedidos) {
      const visita = pedido.registroExistencias.visitaCliente;
      // Legacy snapshots without a visit are intentionally outside this read model.
      if (!visita || pedido.registroExistencias.corregidoPor) continue;
      let tienda = tiendaMap.get(pedido.clienteId);
      if (!tienda) {
        tienda = { clienteId: pedido.clienteId, cliente: pedido.cliente.nombre, pedidos: [] };
        tiendaMap.set(pedido.clienteId, tienda);
      }
      const details: Product[] = pedido.detalles.map((detail) => ({
        saborId: detail.saborId, sabor: detail.sabor.nombre,
        presentacionId: detail.presentacionId, presentacion: detail.presentacion.nombre,
        cantidad: detail.cantidadSolicitada,
      }));
      tienda.pedidos.push({
        pedidoProduccionId: pedido.id,
        registroExistenciasId: pedido.registroExistenciasId,
        visitaClienteId: pedido.registroExistencias.visitaClienteId!,
        llegadaAt: visita.llegadaAt,
        repartidorId: pedido.repartidorId,
        repartidor: pedido.repartidor.nombre,
        detalles: details,
      });
      for (const detail of details) {
        const key = `${detail.saborId}:${detail.presentacionId}`;
        const existing = consolidadoMap.get(key);
        if (existing) existing.cantidad += detail.cantidad;
        else consolidadoMap.set(key, { ...detail });
      }
    }

    const compareProduct = (a: Product, b: Product) => a.sabor.localeCompare(b.sabor, 'es') || a.presentacion.localeCompare(b.presentacion, 'es') || a.saborId - b.saborId || a.presentacionId - b.presentacionId;
    const tiendas = [...tiendaMap.values()].sort((a, b) => a.cliente.localeCompare(b.cliente, 'es') || a.clienteId - b.clienteId);
    for (const tienda of tiendas) {
      tienda.pedidos.sort((a, b) => new Date(a.llegadaAt as Date).getTime() - new Date(b.llegadaAt as Date).getTime() || Number(a.pedidoProduccionId) - Number(b.pedidoProduccionId));
      for (const pedido of tienda.pedidos) (pedido.detalles as Product[]).sort(compareProduct);
    }
    const consolidado = [...consolidadoMap.values()].sort(compareProduct);
    return { fecha, timezone, tiendas, consolidado };
  }
}
