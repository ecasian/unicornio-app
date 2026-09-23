import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../db/prisma.service.js';
import { StockObjetivoController } from './stock-objetivo.controller.js';
import { StockObjetivoService } from './stock-objetivo.service.js';
import { SurtidoOperativoController } from './surtido-operativo.controller.js';

type Cliente = { id: number; activo: boolean; manejaMedioLitro: boolean };
type Sabor = { id: number; nombre: string; activo: boolean };
type Relation = { saborId: number; presentacionId: number; habilitada: boolean; presentacion: { id: number; nombre: string; litrosEquivalentes: number } };
type Row = { clienteId: number; saborId: number; presentacionId: number; cantidad: number; createdAt: Date; updatedAt: Date };
const clientes = new Map<number, Cliente>();
const sabores = new Map<number, Sabor>();
const relaciones = new Map<string, Relation>();
const rows = new Map<string, Row>();
const clave = (clienteId: number, saborId: number, presentacionId: number) => `${clienteId}:${saborId}:${presentacionId}`;
const presentaciones = [
  { id: 1, nombre: '1 litro', litrosEquivalentes: 1 },
  { id: 2, nombre: '1/2 litro', litrosEquivalentes: 0.5 },
];
const details = (row: Row) => ({ ...row, sabor: sabores.get(row.saborId), presentacion: presentaciones.find((item) => item.id === row.presentacionId) });

const repository = {
  $executeRaw: async () => 1,
  cliente: { findUnique: async ({ where }: { where: { id: number } }) => clientes.get(where.id) ?? null },
  sabor: { findMany: async ({ where }: { where: { id: { in: number[] } } }) => [...sabores.values()].filter((row) => where.id.in.includes(row.id)) },
  saborPresentacion: { findMany: async ({ where }: { where: { saborId: { in: number[] }; habilitada?: boolean } }) => [...relaciones.values()].filter((row) => where.saborId.in.includes(row.saborId) && (where.habilitada === undefined || row.habilitada === where.habilitada)) },
  stockObjetivo: {
    findMany: async ({ where }: { where: { clienteId: number } }) => [...rows.values()].filter((row) => row.clienteId === where.clienteId).sort((a, b) => a.saborId - b.saborId || a.presentacionId - b.presentacionId).map(details),
    deleteMany: async ({ where }: { where: { clienteId: number; NOT?: { OR: { saborId: number; presentacionId: number }[] } } }) => {
      for (const row of rows.values()) {
        if (row.clienteId !== where.clienteId) continue;
        if (where.NOT?.OR.some((item) => item.saborId === row.saborId && item.presentacionId === row.presentacionId)) continue;
        rows.delete(clave(row.clienteId, row.saborId, row.presentacionId));
      }
    },
    upsert: async ({ where, create, update }: { where: { clienteId_saborId_presentacionId: { clienteId: number; saborId: number; presentacionId: number } }; create: Row; update: { cantidad: number } }) => {
      const ids = where.clienteId_saborId_presentacionId;
      const key = clave(ids.clienteId, ids.saborId, ids.presentacionId);
      const prior = rows.get(key);
      const row = prior ? { ...prior, ...update, updatedAt: new Date() } : { ...create, createdAt: new Date(), updatedAt: new Date() };
      rows.set(key, row);
      return details(row);
    },
  },
  $transaction: async <T>(run: (tx: typeof repository) => Promise<T>) => {
    const snapshot = new Map(rows);
    try { return await run(repository); }
    catch (error) { rows.clear(); for (const [key, row] of snapshot) rows.set(key, row); throw error; }
  },
};

class StockHttpTestModule {}
Module({ controllers: [StockObjetivoController, SurtidoOperativoController], providers: [StockObjetivoService, { provide: PrismaService, useValue: repository }] })(StockHttpTestModule);

describe('StockObjetivo HTTP', () => {
  let app: INestApplication;
  let base: string;
  beforeAll(async () => {
    app = await NestFactory.create(StockHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/clientes`;
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => {
    clientes.clear(); sabores.clear(); relaciones.clear(); rows.clear();
    clientes.set(1, { id: 1, activo: true, manejaMedioLitro: true });
    sabores.set(1, { id: 1, nombre: 'Fresa', activo: true });
    for (const presentacion of presentaciones) relaciones.set(`1:${presentacion.id}`, { saborId: 1, presentacionId: presentacion.id, habilitada: true, presentacion });
  });
  const path = (id = 1) => `${base}/${id}/stock-objetivo`;
  const operativoPath = (id = 1) => `${base}/${id}/surtido-operativo`;
  const put = (combinaciones: unknown, id = 1) => fetch(path(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ combinaciones }) });
  const item = (presentacionId: number, cantidad: number, saborId = 1) => ({ saborId, presentacionId, cantidad });
  const seed = (saborId: number, presentacionId: number, cantidad: number) => {
    rows.set(clave(1, saborId, presentacionId), {
      clienteId: 1, saborId, presentacionId, cantidad, createdAt: new Date(), updatedAt: new Date(),
    });
  };

  it('returns only currently operable configured rows and retains a configured zero', async () => {
    sabores.set(2, { id: 2, nombre: 'Nuez', activo: false });
    relaciones.set('2:1', { saborId: 2, presentacionId: 1, habilitada: true, presentacion: presentaciones[0] });
    seed(1, 1, 0);
    seed(1, 2, 6);
    seed(2, 1, 9);

    let response = await fetch(operativoPath());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([
      { saborId: 1, presentacionId: 1, cantidad: 0 },
      { saborId: 1, presentacionId: 2, cantidad: 6 },
    ]);

    relaciones.get('1:1')!.habilitada = false;
    response = await fetch(operativoPath());
    expect(await response.json()).toMatchObject([{ presentacionId: 2, cantidad: 6 }]);

    clientes.get(1)!.manejaMedioLitro = false;
    response = await fetch(operativoPath());
    expect(await response.json()).toEqual([]);
    expect(rows.size).toBe(3);
  });

  it('distinguishes no configured row from an operable row with quantity zero', async () => {
    expect(await (await fetch(operativoPath())).json()).toEqual([]);
    seed(1, 1, 0);
    expect(await (await fetch(operativoPath())).json()).toMatchObject([{ cantidad: 0 }]);
  });

  it('rejects missing and inactive clients on the read-only operative endpoint', async () => {
    expect((await fetch(operativoPath(9))).status).toBe(404);
    clientes.get(1)!.activo = false;
    expect((await fetch(operativoPath())).status).toBe(400);
    expect((await fetch(operativoPath(), { method: 'PUT' })).status).toBe(404);
  });

  it('gets configured rows with flavor and presentation, retaining zero as a row', async () => {
    expect((await (await fetch(path())).json()) as unknown[]).toEqual([]);
    expect((await put([item(1, 0), item(2, 6)])).status).toBe(200);
    const response = await fetch(path());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([
      { cantidad: 0, sabor: { nombre: 'Fresa' }, presentacion: { nombre: '1 litro' } },
      { cantidad: 6, presentacion: { nombre: '1/2 litro' } },
    ]);
    expect(rows.size).toBe(2);
  });

  it('replaces the complete assortment and removes excluded rows while preserving zero', async () => {
    await put([item(1, 9), item(2, 6)]);
    expect((await put([item(2, 0)])).status).toBe(200);
    expect([...rows.values()].map((row) => [row.presentacionId, row.cantidad])).toEqual([[2, 0]]);
    expect(await (await fetch(path())).json()).toMatchObject([{ presentacionId: 2, cantidad: 0 }]);
    expect((await put([])).status).toBe(200);
    expect(rows.size).toBe(0);
  });

  it('rejects invalid amounts and duplicate combinations before changing stored rows', async () => {
    await put([item(1, 4)]);
    expect((await put([item(1, -1)])).status).toBe(400);
    expect((await put([item(1, 1.5)])).status).toBe(400);
    expect((await put([item(1, 1), item(1, 2)])).status).toBe(400);
    expect([...rows.values()].map((row) => row.cantidad)).toEqual([4]);
  });

  it('rejects missing and inactive clients and missing or inactive flavors', async () => {
    expect((await fetch(path(9))).status).toBe(404);
    expect((await put([item(1, 1)], 9)).status).toBe(404);
    clientes.get(1)!.activo = false;
    expect((await put([item(1, 1)])).status).toBe(400);
    clientes.get(1)!.activo = true;
    expect((await put([item(1, 1, 9)])).status).toBe(404);
    sabores.get(1)!.activo = false;
    expect((await put([item(1, 1)])).status).toBe(400);
    expect(rows.size).toBe(0);
  });

  it('rejects disabled/unknown presentations and half-liter for a client who does not handle it', async () => {
    relaciones.get('1:1')!.habilitada = false;
    expect((await put([item(1, 1)])).status).toBe(400);
    expect((await put([item(9, 1)])).status).toBe(400);
    relaciones.get('1:1')!.habilitada = true;
    clientes.get(1)!.manejaMedioLitro = false;
    expect((await put([item(2, 1)])).status).toBe(400);
    expect(rows.size).toBe(0);
  });

  it('does not expose DELETE', async () => {
    await put([item(1, 2)]);
    expect((await fetch(path(), { method: 'DELETE' })).status).toBe(404);
    expect(rows.size).toBe(1);
  });
});
