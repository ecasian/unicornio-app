import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../db/prisma.service.js';
import { RepartidoresController } from './repartidores.controller.js';
import { RepartidoresService } from './repartidores.service.js';

type Row = { id: number; nombre: string; activo: boolean; createdAt: Date; updatedAt: Date };
const rows = new Map<number, Row>();
let nextId = 1;
const repository = {
  findMany: async ({ where }: { where?: { activo: boolean } }) =>
    [...rows.values()].filter((row) => where === undefined || row.activo === where.activo),
  findUnique: async ({ where }: { where: { id: number } }) => rows.get(where.id) ?? null,
  create: async ({ data }: { data: { nombre: string; activo: boolean } }) => {
    const now = new Date();
    const row = { id: nextId++, ...data, createdAt: now, updatedAt: now };
    rows.set(row.id, row);
    return row;
  },
  update: async ({ where, data }: { where: { id: number }; data: Partial<Row> }) => {
    const previous = rows.get(where.id);
    if (!previous) throw new Error('El registro no existe');
    const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    const row = { ...previous, ...defined, updatedAt: new Date() };
    rows.set(row.id, row);
    return row;
  },
};

class RepartidoresHttpTestModule {}
Module({
  controllers: [RepartidoresController],
  providers: [RepartidoresService, { provide: PrismaService, useValue: { repartidor: repository } }],
})(RepartidoresHttpTestModule);

describe('Repartidores HTTP', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(RepartidoresHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/repartidores`;
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { rows.clear(); nextId = 1; });

  async function create(nombre = 'María López') {
    return fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre }) });
  }

  it('creates, lists, edits and deactivates without deleting', async () => {
    const createdResponse = await create();
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as Row;
    expect(created).toMatchObject({ nombre: 'María López', activo: true });
    expect((await (await fetch(base)).json() as Row[]).map((row) => row.id)).toEqual([created.id]);

    const rename = await fetch(`${base}/${created.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'María Pérez' }) });
    expect(rename.status).toBe(200);
    expect(await rename.json()).toMatchObject({ nombre: 'María Pérez', activo: true });

    const deactivate = await fetch(`${base}/${created.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: false }) });
    expect(deactivate.status).toBe(200);
    expect(await deactivate.json()).toMatchObject({ nombre: 'María Pérez', activo: false });
    const retrieved = await fetch(`${base}/${created.id}`);
    expect(retrieved.status).toBe(200);
    expect(await retrieved.json()).toMatchObject({ id: created.id, nombre: 'María Pérez', activo: false });
    expect((await fetch(`${base}/${created.id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${base}/${created.id}`)).status).toBe(200);
  });

  it('parses both filters and rejects an invalid filter', async () => {
    const created = (await (await create()).json()) as Row;
    const active = await fetch(`${base}?activo=true`);
    expect(active.status).toBe(200);
    expect((await active.json() as Row[]).map((row) => row.id)).toEqual([created.id]);
    await fetch(`${base}/${created.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: false }) });
    const inactive = await fetch(`${base}?activo=false`);
    expect(inactive.status).toBe(200);
    expect((await inactive.json() as Row[]).map((row) => row.id)).toEqual([created.id]);
    expect(await (await fetch(`${base}?activo=true`)).json()).toEqual([]);
    expect((await fetch(`${base}?activo=invalid`)).status).toBe(400);
  });

  it('validates creation and update, rejects unknown fields and returns 404', async () => {
    expect((await create('   ')).status).toBe(400);
    expect((await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'María', celular: '123' }) })).status).toBe(400);
    expect((await fetch(`${base}/999`)).status).toBe(404);
    expect((await fetch(`${base}/999`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'Otro' }) })).status).toBe(404);
    const created = (await (await create()).json()) as Row;
    expect((await fetch(`${base}/${created.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: null }) })).status).toBe(400);
  });
});
