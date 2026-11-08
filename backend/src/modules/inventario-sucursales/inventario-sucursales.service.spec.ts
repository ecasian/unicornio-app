import { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InventarioSucursalesService } from './inventario-sucursales.service.js';

function serviceAt(now: string, reports: unknown[] = []) {
  vi.useFakeTimers(); vi.setSystemTime(new Date(now));
  const prisma = {
    sucursal: { findMany: vi.fn(async () => []) },
    sabor: { findMany: vi.fn(async () => []) },
    reporteInventarioSucursal: { findMany: vi.fn(async () => reports), groupBy: vi.fn(async () => []) },
  };
  return { service: new InventarioSucursalesService(prisma as never, { get: () => 'America/Mexico_City' } as never), prisma };
}

afterEach(() => { vi.useRealTimers(); });

describe('InventarioSucursales business date and decimal summary', () => {
  it.each([
    ['2026-11-07T05:59:59.999Z', '2026-11-06'],
    ['2026-11-07T06:00:00.000Z', '2026-11-07'],
  ])('uses backend Mexico City calendar date across midnight (%s)', async (now, expected) => {
    const { service } = serviceAt(now);
    await expect(service.captura()).resolves.toMatchObject({ fecha: expected, timezone: 'America/Mexico_City' });
    await expect(service.consultar(undefined, 'MATUTINO')).resolves.toMatchObject({ fecha: expected, turno: 'MATUTINO', timezone: 'America/Mexico_City' });
  });

  it('rejects impossible calendar dates', async () => {
    const { service } = serviceAt('2026-11-07T06:00:00.000Z');
    await expect(service.consultar('2026-02-30', 'MATUTINO')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sums only supplied report details with exact decimal arithmetic', async () => {
    const reports = [
      { id: 1, sucursalId: 1, turno: 'MATUTINO', fecha: new Date('2026-11-06T00:00:00Z'), estado: 'CONFIRMADO', confirmadoAt: null, createdAt: new Date(0), updatedAt: new Date(0), sucursal: { id: 1, nombre: 'Centro', activo: true }, detalles: [{ saborId: 1, litros: new Prisma.Decimal('0.5'), sabor: { id: 1, nombre: 'Fresa' } }, { saborId: 2, litros: new Prisma.Decimal('2.5'), sabor: { id: 2, nombre: 'Nuez' } }] },
      { id: 2, sucursalId: 2, turno: 'MATUTINO', fecha: new Date('2026-11-06T00:00:00Z'), estado: 'CONFIRMADO', confirmadoAt: null, createdAt: new Date(0), updatedAt: new Date(0), sucursal: { id: 2, nombre: 'Norte', activo: true }, detalles: [{ saborId: 1, litros: new Prisma.Decimal('6.5'), sabor: { id: 1, nombre: 'Fresa' } }] },
    ];
    const { service } = serviceAt('2026-11-07T06:00:00.000Z', reports);
    const result = await service.consultar('2026-11-06', 'MATUTINO');
    expect(result.consolidado).toEqual([{ saborId: 1, sabor: 'Fresa', litros: '7' }, { saborId: 2, sabor: 'Nuez', litros: '2.5' }]);
    expect(result.sucursales[0].detalles).toHaveLength(2);
    expect(result.sucursales[1].detalles).toHaveLength(1);
  });
});
