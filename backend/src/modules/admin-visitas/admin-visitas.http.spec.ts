import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../db/prisma.service.js';
import { resolveBusinessDate } from '../produccion/business-date.js';
import { AdminVisitasController } from './admin-visitas.controller.js';
import { AdminVisitasService } from './admin-visitas.service.js';

const newer = { id: 12, llegadaAt: new Date('2026-10-07T23:00:00.000Z'), cliente: { id: 2, nombre: 'Tienda Centro' }, repartidor: { id: 3, nombre: 'Beto' } };
const older = { id: 11, llegadaAt: new Date('2026-10-07T18:00:00.000Z'), cliente: { id: 2, nombre: 'Tienda Centro' }, repartidor: { id: 4, nombre: 'Ana' } };
const findMany = vi.fn(async () => [newer, older]);
const prisma = { visitaCliente: { findMany } };

class AdminVisitasTestModule {}
Module({
  controllers: [AdminVisitasController],
  providers: [
    AdminVisitasService,
    { provide: PrismaService, useValue: prisma },
    { provide: ConfigService, useValue: { get: () => 'America/Mexico_City' } },
  ],
})(AdminVisitasTestModule);

describe('AdminVisitas HTTP', () => {
  let app: INestApplication;
  let base: string;
  beforeAll(async () => {
    app = await NestFactory.create(AdminVisitasTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/admin/visitas`;
  });
  afterAll(async () => { await app?.close(); });

  it('returns visits in database order and filters using timezone day bounds', async () => {
    findMany.mockClear();
    const response = await fetch(`${base}?fecha=2026-10-07`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      fecha: '2026-10-07', timezone: 'America/Mexico_City',
      filtros: { clienteId: null, repartidorId: null },
      visitas: [
        { ...newer, llegadaAt: newer.llegadaAt.toISOString() },
        { ...older, llegadaAt: older.llegadaAt.toISOString() },
      ],
    });
    const window = resolveBusinessDate('2026-10-07', 'America/Mexico_City');
    expect(findMany).toHaveBeenCalledWith({
      where: { llegadaAt: { gte: window.start, lt: window.end } },
      select: expect.objectContaining({ cliente: { select: { id: true, nombre: true } }, repartidor: { select: { id: true, nombre: true } } }),
      orderBy: [{ llegadaAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('uses today from the server by default and returns an empty list as HTTP 200', async () => {
    findMany.mockResolvedValueOnce([]);
    const response = await fetch(base);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ timezone: 'America/Mexico_City', filtros: { clienteId: null, repartidorId: null }, visitas: [] });
    expect(body.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const expected = resolveBusinessDate(body.fecha, 'America/Mexico_City');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { llegadaAt: { gte: expected.start, lt: expected.end } } }));
  });

  it('accepts client, driver, and combined filters', async () => {
    for (const query of ['clienteId=2', 'repartidorId=3', 'clienteId=2&repartidorId=3']) {
      findMany.mockClear();
      const response = await fetch(`${base}?fecha=2026-10-07&${query}`);
      expect(response.status).toBe(200);
      const parsed = new URLSearchParams(query);
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          ...(parsed.has('clienteId') ? { clienteId: 2 } : {}),
          ...(parsed.has('repartidorId') ? { repartidorId: 3 } : {}),
        }),
      }));
      expect(await response.json()).toMatchObject({
        filtros: { clienteId: parsed.has('clienteId') ? 2 : null, repartidorId: parsed.has('repartidorId') ? 3 : null },
      });
    }
  });

  it.each(['07-10-2026', '2026/10/07', '2026-02-30', 'abc'])('returns 400 for invalid date %s', async (fecha) => {
    expect((await fetch(`${base}?fecha=${encodeURIComponent(fecha)}`)).status).toBe(400);
  });

  it.each(['0', '-1', '1.2', '1.0', '1e1', 'abc'])('returns 400 for invalid clienteId %s', async (clienteId) => {
    expect((await fetch(`${base}?clienteId=${encodeURIComponent(clienteId)}`)).status).toBe(400);
  });

  it.each(['0', '-1', '1.2', '1.0', '1e1', 'abc'])('returns 400 for invalid repartidorId %s', async (repartidorId) => {
    expect((await fetch(`${base}?repartidorId=${encodeURIComponent(repartidorId)}`)).status).toBe(400);
  });
});
