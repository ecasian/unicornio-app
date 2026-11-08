import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { StockObjetivoSucursalesController } from './stock-objetivo-sucursales.controller.js';
import { StockObjetivoSucursalesService } from './stock-objetivo-sucursales.service.js';

const service = {
  get: vi.fn(async (id: number) => ({ sucursal: { id }, objetivos: [] })),
  replace: vi.fn(async (id: number, body: unknown) => ({ sucursal: { id }, ...(body as object) })),
  compare: vi.fn(async (id: number, fecha: string, turno: string) => ({ sucursalId: id, fecha, turno, inventarioEstado: 'AUSENTE', comparaciones: [] })),
};

class StockObjetivoSucursalHttpModule {}
Module({ controllers: [StockObjetivoSucursalesController], providers: [{ provide: StockObjetivoSucursalesService, useValue: service }] })(StockObjetivoSucursalHttpModule);

describe('StockObjetivoSucursal HTTP contract', () => {
  let app: INestApplication;
  let base: string;
  beforeAll(async () => {
    app = await NestFactory.create(StockObjetivoSucursalHttpModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/sucursales/5/stock-objetivo`;
  });
  afterAll(async () => { await app?.close(); });

  it('serves existing objectives and accepts an exact string-decimal replacement including zero', async () => {
    expect((await fetch(base)).status).toBe(200);
    const response = await fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objetivos: [{ saborId: 3, litros: '0' }, { saborId: 4, litros: '12.375' }] }) });
    expect(response.status).toBe(200);
    expect(service.replace).toHaveBeenCalledWith(5, { objetivos: [{ saborId: 3, litros: '0' }, { saborId: 4, litros: '12.375' }] });
  });

  it('rejects malformed values, duplicate flavors and unexpected properties', async () => {
    const bodies = [
      { objetivos: [{ saborId: 1, litros: '-0.5' }] },
      { objetivos: [{ saborId: 1, litros: '1.0001' }] },
      { objetivos: [{ saborId: 1, litros: 1 }] },
      { objetivos: [{ saborId: 1, litros: '100000000000' }] },
      { objetivos: [{ saborId: 1, litros: '1' }, { saborId: 1, litros: '2' }] },
      { objetivos: [], extra: true },
    ];
    for (const body of bodies) expect((await fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status).toBe(400);
    expect((await fetch(`${base}/comparacion?fecha=2026-11-07&turno=MATUTINO`)).status).toBe(200);
    expect((await fetch(`${base}/comparacion?fecha=2026-02-30&turno=MATUTINO`)).status).toBe(400);
    expect((await fetch(`${base}/comparacion?fecha=2026-11-07&turno=TODO`)).status).toBe(400);
    expect((await fetch(`${base}/comparacion?fecha=2026-11-07`)).status).toBe(400);
  });
});
