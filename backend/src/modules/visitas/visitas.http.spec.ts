import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../db/prisma.service.js';
import { VisitasController } from './visitas.controller.js';
import { VisitasService } from './visitas.service.js';

const cliente = { id: 1, activo: true };
const repartidor = { id: 2, activo: true };
const visits: { id: number; clienteId: number; repartidorId: number; llegadaAt: Date }[] = [];
const repository = {
  $queryRaw: async () => [],
  cliente: { findUnique: async ({ where }: { where: { id: number } }) => where.id === 1 ? cliente : null },
  repartidor: { findUnique: async ({ where }: { where: { id: number } }) => where.id === 2 ? repartidor : null },
  visitaCliente: { create: async ({ data }: { data: { clienteId: number; repartidorId: number } }) => {
    const visit = { id: visits.length + 1, ...data, llegadaAt: new Date() };
    visits.push(visit);
    return visit;
  } },
  $transaction: async <T>(run: (tx: typeof repository) => Promise<T>) => run(repository),
};

class VisitasHttpTestModule {}
Module({ controllers: [VisitasController], providers: [VisitasService, { provide: PrismaService, useValue: repository }] })(VisitasHttpTestModule);

describe('VisitaCliente HTTP', () => {
  let app: INestApplication;
  let base: string;
  const post = (clienteId: number, body: unknown) => fetch(`${base}/${clienteId}/visitas`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  beforeAll(async () => {
    app = await NestFactory.create(VisitasHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/clientes`;
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { cliente.activo = true; repartidor.activo = true; visits.length = 0; });

  it('creates an arrival and returns its server timestamp', async () => {
    const response = await post(1, { repartidorId: 2 });
    expect(response.status).toBe(201);
    const result = await response.json() as { id: number; llegadaAt: string };
    expect(result.id).toBe(1);
    expect(Date.parse(result.llegadaAt)).toBeGreaterThan(0);
    expect(visits).toHaveLength(1);
  });

  it('rejects invalid or client supplied timestamps', async () => {
    expect((await post(1, { repartidorId: 0 })).status).toBe(400);
    expect((await post(1, { repartidorId: 2, llegadaAt: '2000-01-01T00:00:00Z' })).status).toBe(400);
    expect(visits).toHaveLength(0);
  });

  it('rejects missing and inactive client or driver', async () => {
    expect((await post(9, { repartidorId: 2 })).status).toBe(404);
    cliente.activo = false;
    expect((await post(1, { repartidorId: 2 })).status).toBe(400);
    cliente.activo = true;
    expect((await post(1, { repartidorId: 9 })).status).toBe(404);
    repartidor.activo = false;
    expect((await post(1, { repartidorId: 2 })).status).toBe(400);
    expect(visits).toHaveLength(0);
  });

  it('has no mutation or history endpoint beyond arrival creation', async () => {
    expect((await fetch(`${base}/1/visitas`, { method: 'GET' })).status).toBe(404);
    expect((await fetch(`${base}/1/visitas/1`, { method: 'PATCH' })).status).toBe(404);
    expect((await fetch(`${base}/1/visitas/1`, { method: 'DELETE' })).status).toBe(404);
  });
});
