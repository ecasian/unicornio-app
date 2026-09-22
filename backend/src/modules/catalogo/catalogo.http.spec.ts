import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../db/prisma.service.js';
import { CatalogoService } from './catalogo.service.js';
import { PresentacionesController } from './presentaciones.controller.js';
import { SaboresController } from './sabores.controller.js';

type SaborRow = { id: number; nombre: string; activo: boolean; createdAt: Date; updatedAt: Date };
type PresentacionRow = { id: number; nombre: string; litrosEquivalentes: number; createdAt: Date; updatedAt: Date };
type RelationRow = { saborId: number; presentacionId: number; habilitada: boolean; createdAt: Date; updatedAt: Date };
const sabores = new Map<number, SaborRow>();
const relations = new Map<string, RelationRow>();
const now = new Date();
const presentaciones: PresentacionRow[] = [
  { id: 1, nombre: '1 litro', litrosEquivalentes: 1, createdAt: now, updatedAt: now },
  { id: 2, nombre: '1/2 litro', litrosEquivalentes: 0.5, createdAt: now, updatedAt: now },
];
let nextId = 1;

const repository = {
  sabor: {
    findMany: async ({ where }: { where?: { activo: boolean } }) =>
      [...sabores.values()].filter((row) => where === undefined || row.activo === where.activo),
    findUnique: async ({ where }: { where: { id: number } }) => sabores.get(where.id) ?? null,
    create: async ({ data }: { data: { nombre: string; activo: boolean } }) => {
      const row = { id: nextId++, ...data, createdAt: new Date(), updatedAt: new Date() };
      sabores.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: number }; data: Partial<SaborRow> }) => {
      const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
      const row = { ...sabores.get(where.id)!, ...defined, updatedAt: new Date() };
      sabores.set(row.id, row);
      return row;
    },
  },
  presentacion: {
    findMany: async ({ include }: { include?: { sabores: { where: { saborId: number } } } }) =>
      include ? presentaciones.map((row) => ({ ...row, sabores: [...relations.values()].filter((relation) => relation.saborId === include.sabores.where.saborId && relation.presentacionId === row.id) })) : presentaciones,
  },
  $transaction: async (run: (transaction: { saborPresentacion: { upsert: (args: {
    where: { saborId_presentacionId: { saborId: number; presentacionId: number } };
    create: { saborId: number; presentacionId: number; habilitada: boolean };
    update: { habilitada: boolean };
  }) => Promise<RelationRow> } }) => Promise<void>) => {
    const snapshot = new Map(relations);
    try {
      await run({ saborPresentacion: { upsert: async ({ where, create, update }) => {
        const { saborId, presentacionId } = where.saborId_presentacionId;
        const key = `${saborId}:${presentacionId}`;
        const prior = relations.get(key);
        const row = prior ? { ...prior, ...update, updatedAt: new Date() } : { ...create, createdAt: new Date(), updatedAt: new Date() };
        relations.set(key, row);
        return row;
      } } });
    } catch (error) {
      relations.clear();
      for (const [key, row] of snapshot) relations.set(key, row);
      throw error;
    }
  },
};

class CatalogoHttpTestModule {}
Module({
  controllers: [SaboresController, PresentacionesController],
  providers: [CatalogoService, { provide: PrismaService, useValue: repository }],
})(CatalogoHttpTestModule);

describe('Catálogo HTTP', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(CatalogoHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { sabores.clear(); relations.clear(); nextId = 1; });

  function send(path: string, method: string, data: unknown) {
    return fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  }

  async function createSabor(nombre = 'Fresa') {
    const response = await send('/sabores', 'POST', { nombre });
    expect(response.status).toBe(201);
    return response.json() as Promise<SaborRow>;
  }

  it('creates, lists, gets, edits and deactivates without removing a flavor', async () => {
    const created = await createSabor();
    expect(created).toMatchObject({ nombre: 'Fresa', activo: true });
    expect((await (await fetch(`${base}/sabores`)).json() as SaborRow[]).map((row) => row.id)).toEqual([created.id]);
    expect(await (await fetch(`${base}/sabores/${created.id}`)).json()).toMatchObject({ id: created.id, nombre: 'Fresa' });
    expect(await (await send(`/sabores/${created.id}`, 'PATCH', { nombre: 'Nuez' })).json()).toMatchObject({ nombre: 'Nuez', activo: true });
    expect(await (await send(`/sabores/${created.id}`, 'PATCH', { activo: false })).json()).toMatchObject({ nombre: 'Nuez', activo: false });
    expect(await (await fetch(`${base}/sabores/${created.id}`)).json()).toMatchObject({ nombre: 'Nuez', activo: false });
    expect((await fetch(`${base}/sabores/${created.id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${base}/sabores/${created.id}`)).status).toBe(200);
  });

  it('parses both active filters and validates input and missing IDs', async () => {
    const created = await createSabor();
    expect((await (await fetch(`${base}/sabores?activo=true`)).json() as SaborRow[]).map((row) => row.id)).toEqual([created.id]);
    expect(await (await fetch(`${base}/sabores?activo=false`)).json()).toEqual([]);
    await send(`/sabores/${created.id}`, 'PATCH', { activo: false });
    expect((await (await fetch(`${base}/sabores?activo=false`)).json() as SaborRow[]).map((row) => row.id)).toEqual([created.id]);
    expect(await (await fetch(`${base}/sabores?activo=true`)).json()).toEqual([]);
    expect((await fetch(`${base}/sabores?activo=invalid`)).status).toBe(400);
    expect((await send('/sabores', 'POST', { nombre: '   ' })).status).toBe(400);
    expect((await send('/sabores', 'POST', { nombre: 'Fresa', activo: false })).status).toBe(400);
    expect((await send(`/sabores/${created.id}`, 'PATCH', { nombre: '' })).status).toBe(400);
    expect((await fetch(`${base}/sabores/999`)).status).toBe(404);
    expect((await send('/sabores/999', 'PATCH', { nombre: 'Nuez' })).status).toBe(404);
    expect((await fetch(`${base}/sabores/999/presentaciones`)).status).toBe(404);
    expect((await send('/sabores/999/presentaciones', 'PUT', { presentaciones: [{ presentacionId: 1, habilitada: true }, { presentacionId: 2, habilitada: false }] })).status).toBe(404);
  });

  it('lists only the two initial presentations and exposes no write route', async () => {
    const response = await fetch(`${base}/presentaciones`);
    expect(response.status).toBe(200);
    expect((await response.json() as PresentacionRow[]).map(({ nombre, litrosEquivalentes }) => ({ nombre, litrosEquivalentes }))).toEqual([
      { nombre: '1 litro', litrosEquivalentes: 1 },
      { nombre: '1/2 litro', litrosEquivalentes: 0.5 },
    ]);
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      expect((await fetch(`${base}/presentaciones`, { method })).status).toBe(404);
    }
  });

  it('reads and updates both presentation states without duplicate combinations or deleting them', async () => {
    const created = await createSabor();
    const path = `/sabores/${created.id}/presentaciones`;
    expect(await (await fetch(`${base}${path}`)).json()).toMatchObject([
      { presentacionId: 1, habilitada: false }, { presentacionId: 2, habilitada: false },
    ]);
    const first = [{ presentacionId: 1, habilitada: true }, { presentacionId: 2, habilitada: false }];
    expect((await send(path, 'PUT', { presentaciones: first })).status).toBe(200);
    expect(await (await fetch(`${base}${path}`)).json()).toMatchObject(first);
    await send(`/sabores/${created.id}`, 'PATCH', { activo: false });
    const second = [{ presentacionId: 1, habilitada: false }, { presentacionId: 2, habilitada: true }];
    expect((await send(path, 'PUT', { presentaciones: second })).status).toBe(200);
    expect(await (await fetch(`${base}${path}`)).json()).toMatchObject(second);
    expect(relations.size).toBe(2);
    expect([...relations.values()].map(({ habilitada }) => habilitada)).toEqual([false, true]);
  });

  it('rejects duplicate, missing and nonexistent presentation IDs without changing saved states', async () => {
    const created = await createSabor();
    const path = `/sabores/${created.id}/presentaciones`;
    const valid = [{ presentacionId: 1, habilitada: true }, { presentacionId: 2, habilitada: false }];
    await send(path, 'PUT', { presentaciones: valid });
    for (const invalid of [
      [{ presentacionId: 1, habilitada: false }, { presentacionId: 1, habilitada: false }],
      [{ presentacionId: 1, habilitada: false }, { presentacionId: 999, habilitada: false }],
      [{ presentacionId: 1, habilitada: false }],
    ]) {
      expect((await send(path, 'PUT', { presentaciones: invalid })).status).toBe(400);
      expect(await (await fetch(`${base}${path}`)).json()).toMatchObject(valid);
    }
    expect((await send(path, 'PUT', { presentaciones: [{ presentacionId: 1, habilitada: 'true' }, valid[1]] })).status).toBe(400);
  });
});
