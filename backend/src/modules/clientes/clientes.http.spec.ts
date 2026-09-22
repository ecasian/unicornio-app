import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../db/prisma.service.js';
import { ClientesController } from './clientes.controller.js';
import { ClientesService } from './clientes.service.js';

type ClienteRow = {
  id: number;
  nombre: string;
  celular: string;
  direccion: string;
  manejaMedioLitro: boolean;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const rows = new Map<number, ClienteRow>();
let nextId = 1;
const repository = {
  findMany: async ({ where }: { where?: { activo: boolean } }) =>
    [...rows.values()].filter((row) => where === undefined || row.activo === where.activo),
  findUnique: async ({ where }: { where: { id: number } }) => rows.get(where.id) ?? null,
  create: async ({ data }: { data: Omit<ClienteRow, 'id' | 'createdAt' | 'updatedAt'> }) => {
    const now = new Date();
    const row = { id: nextId++, ...data, createdAt: now, updatedAt: now };
    rows.set(row.id, row);
    return row;
  },
  update: async ({ where, data }: { where: { id: number }; data: Partial<ClienteRow> }) => {
    const previous = rows.get(where.id);
    if (!previous) throw new Error('El registro no existe');
    const definedData = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    const row = { ...previous, ...definedData, updatedAt: new Date() };
    rows.set(row.id, row);
    return row;
  },
};

class ClientesHttpTestModule {}

Module({
  controllers: [ClientesController],
  providers: [ClientesService, { provide: PrismaService, useValue: { cliente: repository } }],
})(ClientesHttpTestModule);

describe('Clientes HTTP', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(ClientesHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    base = `http://127.0.0.1:${address.port}/api/clientes`;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    rows.clear();
    nextId = 1;
  });

  it('creates, deactivates and still retrieves the same client; no DELETE route exists', async () => {
    const create = await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Punto Fresco', celular: '3121234567', direccion: 'Av. Ejemplo 123', manejaMedioLitro: true }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as ClienteRow;
    expect(created.activo).toBe(true);

    const deactivate = await fetch(`${base}/${created.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: false }),
    });
    expect(deactivate.status).toBe(200);
    expect((await deactivate.json() as ClienteRow).activo).toBe(false);

    const retrieved = await fetch(`${base}/${created.id}`);
    expect(retrieved.status).toBe(200);
    expect(await retrieved.json()).toMatchObject({ id: created.id, nombre: created.nombre, activo: false });
    expect((await fetch(`${base}/${created.id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${base}/${created.id}`)).status).toBe(200);
  });

  it('parses active and inactive filters and rejects invalid values', async () => {
    const created = await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Punto Fresco', celular: '3121234567', direccion: 'Av. Ejemplo 123', manejaMedioLitro: true }),
    });
    const { id } = (await created.json()) as ClienteRow;
    const activeBefore = await fetch(`${base}?activo=true`);
    expect(activeBefore.status).toBe(200);
    expect((await activeBefore.json() as ClienteRow[]).map((row) => row.id)).toEqual([id]);
    await fetch(`${base}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: false }) });
    const inactive = await fetch(`${base}?activo=false`);
    expect(inactive.status).toBe(200);
    expect((await inactive.json() as ClienteRow[]).map((row) => row.activo)).toEqual([false]);
    const active = await fetch(`${base}?activo=true`);
    expect(active.status).toBe(200);
    expect(await active.json()).toEqual([]);
    expect((await fetch(`${base}?activo=invalid`)).status).toBe(400);
  });

  it('returns 404 for a client that does not exist', async () => {
    expect((await fetch(`${base}/999`)).status).toBe(404);
    expect((await fetch(`${base}/999`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: false }) })).status).toBe(404);
  });
});
