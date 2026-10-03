import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../db/prisma.service.js';
import { StockObjetivoService } from '../stock-objetivo/stock-objetivo.service.js';
import { ExistenciasController } from './existencias.controller.js';
import { ExistenciasService } from './existencias.service.js';

const cliente = { id: 1, nombre: 'Tienda', activo: true, manejaMedioLitro: true };
const repartidor = { id: 2, nombre: 'Jonathan', activo: true };
const sabor = { id: 3, nombre: 'Fresa', activo: true };
const litro = { id: 4, nombre: '1 litro', litrosEquivalentes: 1 };
const medio = { id: 5, nombre: '1/2 litro', litrosEquivalentes: 0.5 };
const relations = [
  { saborId: 3, presentacionId: 4, habilitada: true, presentacion: litro },
  { saborId: 3, presentacionId: 5, habilitada: true, presentacion: medio },
];
type Detail = { saborId: number; presentacionId: number; cantidad: number };
type Registro = { id: number; clienteId: number; repartidorId: number; visitaClienteId: number | null; createdAt: Date; detalles: Detail[] };
type Movimiento = { id: number; registroExistenciasId: number; clienteId: number; repartidorId: number; tipo: string; createdAt: Date };
let stock: { saborId: number; presentacionId: number; cantidad: number }[];
let registros: Registro[];
let movimientos: Movimiento[];
let pedidos: { id: number; clienteId: number; repartidorId: number; registroExistenciasId: number; detalles: { saborId: number; presentacionId: number; cantidadSugerida: number; cantidadSolicitada: number }[] }[];
let failMovement: boolean;
let failPedido: boolean;
let failDetallePedido: boolean;
let failPedidoMovement: boolean;
let transactionCalls: number;

const expanded = (row: { saborId: number; presentacionId: number; cantidad: number }) => ({
  ...row, clienteId: 1, sabor, presentacion: row.presentacionId === 4 ? litro : medio,
});
const repository = {
  $executeRaw: async () => 1,
  $queryRaw: async () => [],
  cliente: { findUnique: async ({ where }: { where: { id: number } }) => where.id === 1 ? cliente : null },
  repartidor: { findUnique: async ({ where }: { where: { id: number } }) => where.id === 2 ? repartidor : null },
  visitaCliente: { findUnique: async ({ where }: { where: { id: number } }) => where.id === 10
    ? { id: 10, clienteId: 1, repartidorId: 2 }
    : where.id === 11 ? { id: 11, clienteId: 9, repartidorId: 2 }
      : where.id === 12 ? { id: 12, clienteId: 1, repartidorId: 9 } : null },
  saborPresentacion: { findMany: async () => relations.filter((item) => item.habilitada) },
  stockObjetivo: { findMany: async ({ where }: { where: { clienteId: number } }) => where.clienteId === 1 ? stock.map(expanded) : [] },
  registroExistencias: {
    create: async ({ data }: { data: { clienteId: number; repartidorId: number; visitaClienteId: number; createdAt: Date; detalles: { create: Detail[] } } }) => {
      const row = { id: registros.length + 1, clienteId: data.clienteId, repartidorId: data.repartidorId,
        visitaClienteId: data.visitaClienteId, createdAt: data.createdAt, detalles: data.detalles.create };
      registros.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: { id: number } }) => {
      const row = registros.find((item) => item.id === where.id);
      const pedido = pedidos.find((item) => item.registroExistenciasId === row?.id);
      return row ? { ...row, cliente, repartidor, movimiento: movimientos.find((item) => item.registroExistenciasId === row.id) ?? null,
        pedidoProduccion: pedido ? { ...pedido, detalles: pedido.detalles.map((detail) => ({ ...detail, sabor,
          presentacion: detail.presentacionId === 4 ? litro : medio })),
        movimiento: movimientos.find((item) => (item as Movimiento & { pedidoProduccionId?: number }).pedidoProduccionId === pedido.id) } : null } : null;
    },
    findUniqueOrThrow: async ({ where }: { where: { id: number } }) => {
      const row = await repository.registroExistencias.findUnique({ where });
      if (!row) throw Error('Registro faltante');
      return row;
    },
  },
  pedidoProduccion: {
    create: async ({ data }: { data: { clienteId: number; repartidorId: number; registroExistenciasId: number;
      detalles: { create: { saborId: number; presentacionId: number; cantidadSugerida: number; cantidadSolicitada: number }[] } } }) => {
      if (failPedido) throw Error('Pedido falló');
      if (failDetallePedido) throw Error('DetallePedido falló');
      const row = { id: pedidos.length + 1, clienteId: data.clienteId, repartidorId: data.repartidorId,
        registroExistenciasId: data.registroExistenciasId, detalles: data.detalles.create };
      pedidos.push(row);
      return row;
    },
  },
  movimientoBitacora: {
    create: async ({ data }: { data: Omit<Movimiento, 'id'> }) => {
      if (failMovement || (failPedidoMovement && data.tipo === 'PEDIDO_PRODUCCION')) throw Error('Movimiento falló');
      const row = { id: movimientos.length + 1, ...data };
      movimientos.push(row);
      return row;
    },
  },
  $transaction: async <T>(run: (tx: typeof repository) => Promise<T>) => {
    transactionCalls += 1;
    const beforeRegistros = [...registros];
    const beforeMovimientos = [...movimientos];
    const beforePedidos = [...pedidos];
    try { return await run(repository); }
    catch (error) { registros = beforeRegistros; movimientos = beforeMovimientos; pedidos = beforePedidos; throw error; }
  },
};

class ExistenciasHttpTestModule {}
Module({ controllers: [ExistenciasController], providers: [
  ExistenciasService, StockObjetivoService, { provide: PrismaService, useValue: repository },
] })(ExistenciasHttpTestModule);

describe('RegistroExistencias HTTP', () => {
  let app: INestApplication;
  let base: string;
  const item = (presentacionId: number, cantidad: number, saborId = 3) => ({ saborId, presentacionId, cantidad });
  const post = (existencias: unknown, repartidorId: unknown = 2, clienteId = 1, visitaClienteId: unknown = 10) => fetch(`${base}/${clienteId}/registros-existencias`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repartidorId, visitaClienteId, existencias }),
  });

  beforeAll(async () => {
    app = await NestFactory.create(ExistenciasHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/clientes`;
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => {
    cliente.activo = true; cliente.manejaMedioLitro = true; repartidor.activo = true; sabor.activo = true;
    relations.forEach((item) => { item.habilitada = true; });
    stock = [item(4, 0), item(5, 6)]; registros = []; movimientos = []; pedidos = [];
    failMovement = false; failPedido = false; failDetallePedido = false; failPedidoMovement = false; transactionCalls = 0;
  });

  it('creates a complete immutable snapshot with explicit zeros and one automatic movement', async () => {
    const response = await post([item(4, 0), item(5, 0)]);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ clienteId: 1, repartidorId: 2, visitaClienteId: 10, detalles: [
      { saborId: 3, presentacionId: 4, cantidad: 0 }, { saborId: 3, presentacionId: 5, cantidad: 0 },
    ], movimiento: { tipo: 'REGISTRO_EXISTENCIAS' } });
    expect(registros).toHaveLength(1);
    expect(movimientos).toHaveLength(2);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].detalles).toMatchObject([{ cantidadSugerida: 6, cantidadSolicitada: 6 }]);
    expect(transactionCalls).toBe(1);
    const path = `${base}/1/registros-existencias/1`;
    expect((await fetch(path)).status).toBe(200);
    expect((await fetch(path, { method: 'PATCH' })).status).toBe(404);
    expect((await fetch(path, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${base}/1/registros-existencias`, { method: 'DELETE' })).status).toBe(404);
    expect(registros[0].detalles).toHaveLength(2);
  });

  it('requires a matching visit and still reads historical records without one', async () => {
    const items = [item(4, 0), item(5, 0)];
    expect((await post(items, 2, 1, null)).status).toBe(400);
    expect((await post(items, 2, 1, 99)).status).toBe(404);
    expect((await post(items, 2, 1, 11)).status).toBe(400);
    expect((await post(items, 2, 1, 12)).status).toBe(400);
    expect(registros).toHaveLength(0);
    registros.push({ id: 1, clienteId: 1, repartidorId: 2, visitaClienteId: null, createdAt: new Date(), detalles: items });
    const historical = await fetch(`${base}/1/registros-existencias/1`);
    expect(historical.status).toBe(200);
    expect(await historical.json()).toMatchObject({ visitaClienteId: null });
  });

  it('rejects missing, extra and duplicate combinations without persisting a snapshot', async () => {
    expect((await post([item(4, 1)])).status).toBe(400);
    expect((await post([item(4, 1), item(5, 2), item(9, 3)])).status).toBe(400);
    expect((await post([item(4, 1), item(4, 2)])).status).toBe(400);
    expect(registros).toHaveLength(0);
    expect(movimientos).toHaveLength(0);
  });

  it('rejects negative, decimal, empty and nonnumeric quantities', async () => {
    for (const amount of [-1, 1.5, null, '2']) {
      expect((await post([item(4, amount as number), item(5, 0)])).status).toBe(400);
    }
    expect(registros).toHaveLength(0);
  });

  it('rejects missing or inactive client and repartidor', async () => {
    expect((await post([item(4, 1), item(5, 2)], 2, 9)).status).toBe(404);
    cliente.activo = false;
    expect((await post([item(4, 1), item(5, 2)])).status).toBe(400);
    cliente.activo = true;
    expect((await post([item(4, 1), item(5, 2)], 9)).status).toBe(404);
    repartidor.activo = false;
    expect((await post([item(4, 1), item(5, 2)])).status).toBe(400);
    expect(registros).toHaveLength(0);
  });

  it('rejects no assortment and a combination that stopped being operable before POST', async () => {
    stock = [];
    expect((await post([item(4, 1)])).status).toBe(400);
    stock = [item(4, 0), item(5, 6)];
    relations[1].habilitada = false;
    expect((await post([item(4, 1), item(5, 2)])).status).toBe(400);
    relations[1].habilitada = true;
    sabor.activo = false;
    expect((await post([item(4, 1), item(5, 2)])).status).toBe(400);
    sabor.activo = true;
    cliente.manejaMedioLitro = false;
    expect((await post([item(4, 1), item(5, 2)])).status).toBe(400);
    expect(registros).toHaveLength(0);
  });

  it('rolls back register and details when creating the movement fails', async () => {
    failMovement = true;
    expect((await post([item(4, 2), item(5, 0)])).status).toBe(500);
    expect(registros).toHaveLength(0);
    expect(movimientos).toHaveLength(0);
  });

  it('calculates only positive shortages from the persisted snapshot in the POST response', async () => {
    stock = [item(4, 10), item(5, 4)];
    const response = await post([item(4, 7), item(5, 9)]);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ requiereProduccion: true, pedidoProduccion: {
      clienteId: 1, repartidorId: 2, registroExistenciasId: 1,
      detalles: [{ saborId: 3, presentacionId: 4, cantidadSugerida: 3, cantidadSolicitada: 3 }],
      movimiento: { tipo: 'PEDIDO_PRODUCCION' },
    } });
    expect(pedidos).toHaveLength(1);
    expect(movimientos.map((row) => row.tipo).sort()).toEqual(['PEDIDO_PRODUCCION', 'REGISTRO_EXISTENCIAS']);
  });

  it('creates two order details when both presentations have shortages', async () => {
    stock = [item(4, 10), item(5, 4)];
    const response = await post([item(4, 0), item(5, 2)]);
    expect(response.status).toBe(201);
    expect((await response.json()).pedidoProduccion.detalles).toMatchObject([
      { presentacionId: 4, cantidadSugerida: 10, cantidadSolicitada: 10 },
      { presentacionId: 5, cantidadSugerida: 2, cantidadSolicitada: 2 },
    ]);
    expect(pedidos).toHaveLength(1);
  });

  it.each([[0, 10], [10, 0], [15, 0]])('objective 10 and existence %i require %i units', async (existence, needed) => {
    stock = [item(4, 10)];
    const response = await post([item(4, existence)]);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.requiereProduccion).toBe(needed > 0);
    expect(body.pedidoProduccion?.detalles[0]?.cantidadSugerida ?? 0).toBe(needed);
  });

  it('keeps objective zero in the snapshot but creates no empty order', async () => {
    stock = [item(4, 0), item(5, 0)];
    const response = await post([item(4, 0), item(5, 3)]);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ requiereProduccion: false, pedidoProduccion: null,
      detalles: [{ cantidad: 0 }, { cantidad: 3 }] });
    expect(pedidos).toHaveLength(0);
    expect(movimientos).toHaveLength(1);
  });

  it.each(['pedido', 'detalle', 'bitacora'] as const)('rolls back everything if %s creation fails', async (failure) => {
    failPedido = failure === 'pedido';
    failDetallePedido = failure === 'detalle';
    failPedidoMovement = failure === 'bitacora';
    expect((await post([item(4, 0), item(5, 0)])).status).toBe(500);
    expect(registros).toHaveLength(0);
    expect(pedidos).toHaveLength(0);
    expect(movimientos).toHaveLength(0);
  });
});
