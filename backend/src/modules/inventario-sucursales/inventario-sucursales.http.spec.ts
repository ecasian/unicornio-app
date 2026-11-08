import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventarioSucursalesController } from './inventario-sucursales.controller.js';
import { InventarioSucursalesService } from './inventario-sucursales.service.js';

const service = {
  captura: vi.fn(async () => ({ fecha: '2026-11-06', timezone: 'America/Mexico_City', sucursales: [], sabores: [] })),
  reporte: vi.fn(async (sucursalId: number, fecha: string, turno: string) => ({ fecha, reporte: { id: 1, sucursalId, turno } })),
  guardar: vi.fn(async (data: unknown) => data),
  confirmar: vi.fn(async (id: number) => ({ id, estado: 'CONFIRMADO' })),
  consultar: vi.fn(async (fecha: string | undefined, turno: string) => ({ fecha: fecha ?? '2026-11-06', turno, timezone: 'America/Mexico_City', sucursalesPendientes: [], sucursales: [], consolidado: [] })),
};

class InventarioHttpTestModule {}
Module({
  controllers: [InventarioSucursalesController],
  providers: [{ provide: InventarioSucursalesService, useValue: service }],
})(InventarioHttpTestModule);

describe('Inventario sucursales HTTP contract', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(InventarioHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/inventario-sucursales`;
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns the backend operational date, captures and summary routes', async () => {
    expect((await fetch(`${base}/captura`)).status).toBe(200);
    expect(service.captura).toHaveBeenCalledOnce();
    expect((await fetch(`${base}/reporte?sucursalId=3&fecha=2026-11-06&turno=MATUTINO`)).status).toBe(200);
    expect(service.reporte).toHaveBeenCalledWith(3, '2026-11-06', 'MATUTINO');
    expect((await fetch(base)).status).toBe(400);
    expect((await fetch(`${base}?turno=MATUTINO`)).status).toBe(200);
    expect(service.consultar).toHaveBeenCalledWith(undefined, 'MATUTINO');
  });

  it('validates ISO date, positive sucursal and decimal text without accepting negatives or duplicates', async () => {
    const valid = { fecha: '2026-11-06', sucursalId: 3, turno: 'MATUTINO', detalles: [{ saborId: 8, litros: '0' }, { saborId: 9, litros: '2.5' }] };
    expect((await fetch(`${base}/reportes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) })).status).toBe(200);
    expect(service.guardar).toHaveBeenCalledOnce();
    const invalidBodies = [
      { fecha: '2026-11-06', sucursalId: 3, detalles: [] },
      { ...valid, turno: 'NOCHE' },
      { ...valid, fecha: '2026-02-30' },
      { ...valid, sucursalId: 0 },
      { ...valid, detalles: [{ saborId: 8, litros: '-0.5' }] },
      { ...valid, detalles: [{ saborId: 8, litros: 0.5 }] },
      { ...valid, detalles: [{ saborId: 8, litros: '0.0001' }] },
      { ...valid, detalles: [{ saborId: 8, litros: '1' }, { saborId: 8, litros: '2' }] },
    ];
    for (const data of invalidBodies) {
      const response = await fetch(`${base}/reportes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      expect(response.status).toBe(400);
    }
    expect(service.guardar).toHaveBeenCalledOnce();
  });

  it('requires a complete capture query and routes confirmation by report id', async () => {
    expect((await fetch(`${base}/reporte?sucursalId=1&fecha=2026-11-06`)).status).toBe(400);
    expect((await fetch(`${base}/reporte?sucursalId=1&fecha=2026-11-06&turno=NOCHE`)).status).toBe(400);
    expect((await fetch(`${base}/reporte?fecha=2026-11-06`)).status).toBe(400);
    expect((await fetch(`${base}/reportes/17/confirmacion`, { method: 'POST' })).status).toBe(201);
    expect(service.confirmar).toHaveBeenCalledWith(17);
  });
});
