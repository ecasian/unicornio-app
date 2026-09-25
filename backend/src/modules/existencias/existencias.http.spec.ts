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
type Registro = { id: number; clienteId: number; repartidorId: number; createdAt: Date; detalles: Detail[] };
type Movimiento = { id: number; registroExistenciasId: number; clienteId: number; repartidorId: number; tipo: string; createdAt: Date };
let stock: { saborId: number; presentacionId: number; cantidad: number }[];
let registros: Registro[];
let movimientos: Movimiento[];
let failMovement: boolean;
let transactionCalls: number;

const expanded = (row: { saborId: number; presentacionId: number; cantidad: number }) => ({
  ...row, clienteId: 1, sabor, presentacion: row.presentacionId === 4 ? litro : medio,
});
const repository = {
  $executeRaw: async () => 1,
  $queryRaw: async () => [],
  cliente: { findUnique: async ({ where }: { where: { id: number } }) => where.id === 1 ? cliente : null },
  repartidor: { findUnique: async ({ where }: { where: { id: number } }) => where.id === 2 ? repartidor : null },
  saborPresentacion: { findMany: async () => relations.filter((item) => item.habilitada) },
  stockObjetivo: { findMany: async ({ where }: { where: { clienteId: number } }) => where.clienteId === 1 ? stock.map(expanded) : [] },
  registroExistencias: {
    create: async ({ data }: { data: { clienteId: number; repartidorId: number; createdAt: Date; detalles: { create: Detail[] } } }) => {
      const row = { id: registros.length + 1, clienteId: data.clienteId, repartidorId: data.repartidorId,
        createdAt: data.createdAt, detalles: data.detalles.create };
      registros.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: { id: number } }) => {
      const row = registros.find((item) => item.id === where.id);
      return row ? { ...row, cliente, repartidor, movimiento: movimientos.find((item) => item.registroExistenciasId === row.id) ?? null } : null;
    },
    findUniqueOrThrow: async ({ where }: { where: { id: number } }) => {
      const row = await repository.registroExistencias.findUnique({ where });
      if (!row) throw Error('Registro faltante');
      return row;
    },
  },
  movimientoBitacora: {
    create: async ({ data }: { data: Omit<Movimiento, 'id'> }) => {
      if (failMovement) throw Error('Movimiento falló');
      const row = { id: movimientos.length + 1, ...data };
      movimientos.push(row);
      return row;
    },
  },
  $transaction: async <T>(run: (tx: typeof repository) => Promise<T>) => {
    transactionCalls += 1;
    const beforeRegistros = [...registros];
    const beforeMovimientos = [...movimientos];
    try { return await run(repository); }
    catch (error) { registros = beforeRegistros; movimientos = beforeMovimientos; throw error; }
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
  const post = (existencias: unknown, repartidorId: unknown = 2, clienteId = 1) => fetch(`${base}/${clienteId}/registros-existencias`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repartidorId, existencias }),
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
    stock = [item(4, 0), item(5, 6)]; registros = []; movimientos = []; failMovement = false; transactionCalls = 0;
  });

  it('creates a complete immutable snapshot with explicit zeros and one automatic movement', async () => {
    const response = await post([item(4, 0), item(5, 0)]);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ clienteId: 1, repartidorId: 2, detalles: [
      { saborId: 3, presentacionId: 4, cantidad: 0 }, { saborId: 3, presentacionId: 5, cantidad: 0 },
    ], movimiento: { tipo: 'REGISTRO_EXISTENCIAS' } });
    expect(registros).toHaveLength(1);
    expect(movimientos).toHaveLength(1);
    expect(transactionCalls).toBe(1);
    const path = `${base}/1/registros-existencias/1`;
    expect((await fetch(path)).status).toBe(200);
    expect((await fetch(path, { method: 'PATCH' })).status).toBe(404);
    expect((await fetch(path, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${base}/1/registros-existencias`, { method: 'DELETE' })).status).toBe(404);
    expect(registros[0].detalles).toHaveLength(2);
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
});
