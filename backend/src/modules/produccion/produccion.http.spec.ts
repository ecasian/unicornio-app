import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EstadoPedidoProduccion, Prisma } from '@prisma/client';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../db/prisma.service.js';
import { ProduccionController } from './produccion.controller.js';
import { ProduccionService } from './produccion.service.js';

const arriving = new Date('2026-10-05T07:00:00.000Z');
const row = {
  id: 30, clienteId: 2, repartidorId: 3, registroExistenciasId: 40, estado: EstadoPedidoProduccion.VIGENTE,
  cliente: { id: 2, nombre: 'Tienda Centro' }, repartidor: { id: 3, nombre: 'Ana' },
  registroExistencias: { id: 40, visitaClienteId: 50, corregidoPor: null, visitaCliente: { llegadaAt: arriving } },
  detalles: [{ saborId: 7, presentacionId: 1, cantidadSolicitada: 4, sabor: { nombre: 'Fresa' }, presentacion: { nombre: '1 litro' } }],
};
const findMany = vi.fn(async () => [row]);
const prisma = { $transaction: async <T>(callback: (tx: unknown) => Promise<T>, options: unknown) => {
  expect(options).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return callback({ pedidoProduccion: { findMany } });
} };

class ProduccionTestModule {}
Module({
  controllers: [ProduccionController],
  providers: [ProduccionService, { provide: PrismaService, useValue: prisma }, { provide: ConfigService, useValue: { get: () => 'America/Mexico_City' } }],
})(ProduccionTestModule);

describe('Produccion HTTP', () => {
  let app: INestApplication;
  let base: string;
  beforeAll(async () => {
    app = await NestFactory.create(ProduccionTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/produccion`;
  });
  afterAll(async () => { await app?.close(); });

  it('returns detail and consolidation from the same current-order query', async () => {
    findMany.mockClear();
    const response = await fetch(`${base}?fecha=2026-10-05`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      fecha: '2026-10-05', timezone: 'America/Mexico_City',
      tiendas: [{ clienteId: 2, cliente: 'Tienda Centro', pedidos: [{
        pedidoProduccionId: 30, registroExistenciasId: 40, visitaClienteId: 50,
        llegadaAt: arriving.toISOString(), repartidorId: 3, repartidor: 'Ana',
        detalles: [{ saborId: 7, sabor: 'Fresa', presentacionId: 1, presentacion: '1 litro', cantidad: 4 }],
      }] }],
      consolidado: [{ saborId: 7, sabor: 'Fresa', presentacionId: 1, presentacion: '1 litro', cantidad: 4 }],
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      estado: EstadoPedidoProduccion.VIGENTE,
      registroExistencias: { is: { corregidoPor: { is: null }, visitaCliente: { is: { llegadaAt: { gte: expect.any(Date), lt: expect.any(Date) } } } } },
    } }));
  });

  it('uses the server default date and returns an empty result without requiring a pedido', async () => {
    findMany.mockResolvedValueOnce([]);
    const response = await fetch(base);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ timezone: 'America/Mexico_City', tiendas: [], consolidado: [] });
  });

  it.each(['2026-02-30', '2026-2-03', 'x'])('returns 400 for invalid date %s', async (fecha) => {
    const response = await fetch(`${base}?fecha=${fecha}`);
    expect(response.status).toBe(400);
  });

});
