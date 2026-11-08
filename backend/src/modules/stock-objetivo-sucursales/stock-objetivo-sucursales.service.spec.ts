import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EstadoInventarioSucursal, Prisma, TurnoInventarioSucursal } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { StockObjetivoSucursalesService } from './stock-objetivo-sucursales.service.js';

type State = {
  sucursales: { id: number; nombre: string; activo: boolean }[];
  sabores: { id: number; nombre: string; activo: boolean }[];
  objetivos: { sucursalId: number; saborId: number; litros: Prisma.Decimal; createdAt: Date; updatedAt: Date }[];
  reportes: { id: number; sucursalId: number; fecha: Date; turno: TurnoInventarioSucursal; estado: EstadoInventarioSucursal; detalles: { saborId: number; litros: Prisma.Decimal }[] }[];
};

function createService(initial?: Partial<State>) {
  let state: State = {
    sucursales: [{ id: 1, nombre: 'Centro', activo: true }, { id: 2, nombre: 'Inactiva', activo: false }],
    sabores: [{ id: 10, nombre: 'Fresa', activo: true }, { id: 20, nombre: 'Nuez', activo: true }, { id: 30, nombre: 'Ciruela', activo: false }, { id: 40, nombre: 'Mango', activo: false }],
    objetivos: [{ sucursalId: 1, saborId: 10, litros: new Prisma.Decimal('0'), createdAt: new Date(), updatedAt: new Date() }, { sucursalId: 1, saborId: 30, litros: new Prisma.Decimal('2.5'), createdAt: new Date(), updatedAt: new Date() }],
    reportes: [],
    ...initial,
  };
  const cloneState = (source: State): State => ({
    sucursales: source.sucursales.map((item) => ({ ...item })),
    sabores: source.sabores.map((item) => ({ ...item })),
    objetivos: source.objetivos.map((item) => ({ ...item })),
    reportes: source.reportes.map((item) => ({ ...item, detalles: item.detalles.map((detail) => ({ ...detail })) })),
  });
  const projectGoal = (item: State['objetivos'][number], source: State = state) => ({ ...item, sabor: source.sabores.find(({ id }) => id === item.saborId)! });
  const db = {
    $queryRaw: async (query: { values?: unknown[] }) => {
      const id = Number(query.values?.[0]);
      return state.sucursales.some((item) => item.id === id) ? [{ id }] : [];
    },
    sucursal: {
      findUnique: async ({ where }: { where: { id: number } }) => state.sucursales.find(({ id }) => id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: number } }) => state.sucursales.find(({ id }) => id === where.id)!,
    },
    sabor: {
      findMany: async ({ where }: { where: { id?: { in: number[] }; activo?: boolean } }) => state.sabores.filter((item) => (!where.id || where.id.in.includes(item.id)) && (where.activo === undefined || item.activo === where.activo)),
      findUnique: async ({ where }: { where: { id: number } }) => state.sabores.find(({ id }) => id === where.id) ?? null,
    },
    stockObjetivoSucursal: {
      findMany: async ({ where }: { where: { sucursalId: number } }) => state.objetivos.filter(({ sucursalId }) => sucursalId === where.sucursalId).map((item) => projectGoal(item)),
      deleteMany: async ({ where }: { where: { sucursalId: number; saborId?: { in: number[] } } }) => {
        const before = state.objetivos.length;
        state.objetivos = state.objetivos.filter((item) => item.sucursalId !== where.sucursalId || (where.saborId && !where.saborId.in.includes(item.saborId)));
        return { count: before - state.objetivos.length };
      },
      upsert: async ({ where, create, update }: { where: { sucursalId_saborId: { sucursalId: number; saborId: number } }; create: { sucursalId: number; saborId: number; litros: Prisma.Decimal }; update: { litros: Prisma.Decimal } }) => {
        const item = state.objetivos.find((row) => row.sucursalId === where.sucursalId_saborId.sucursalId && row.saborId === where.sucursalId_saborId.saborId);
        if (item) { item.litros = update.litros; item.updatedAt = new Date(); return item; }
        const created = { ...create, createdAt: new Date(), updatedAt: new Date() }; state.objetivos.push(created); return created;
      },
    },
    reporteInventarioSucursal: {
      findUnique: async ({ where }: { where: { sucursalId_fecha_turno: { sucursalId: number; fecha: Date; turno: TurnoInventarioSucursal } } }) => {
        const report = state.reportes.find((item) => item.sucursalId === where.sucursalId_fecha_turno.sucursalId && item.fecha.toISOString() === where.sucursalId_fecha_turno.fecha.toISOString() && item.turno === where.sucursalId_fecha_turno.turno);
        return report ? { ...report, detalles: report.detalles.map((detail) => ({ ...detail, sabor: state.sabores.find(({ id }) => id === detail.saborId)! })) } : null;
      },
    },
  };
  const prisma = {
    ...db,
    $transaction: async <T>(fn: (tx: typeof db) => Promise<T>) => {
      const previous = state;
      state = cloneState(previous);
      try { return await fn(db); }
      catch (error) { state = previous; throw error; }
    },
  };
  return { service: new StockObjetivoSucursalesService(prisma as never, { get: () => 'America/Mexico_City' } as never), state: () => state };
}

describe('StockObjetivoSucursalesService', () => {
  it('represents an explicit zero as a configured row and leaves absence unconfigured', async () => {
    const harness = createService({ sabores: [{ id: 10, nombre: 'Fresa', activo: true }, { id: 20, nombre: 'Nuez', activo: true }], objetivos: [{ sucursalId: 1, saborId: 10, litros: new Prisma.Decimal(0), createdAt: new Date(), updatedAt: new Date() }] });
    const response = await harness.service.get(1);
    expect(response.objetivos).toHaveLength(1);
    expect(response.objetivos[0].litros).toBe('0');
    expect(response.objetivos.some((item) => item.saborId === 20)).toBe(false);
  });

  it('replaces active flavor targets exactly and atomically, preserving inactive targets', async () => {
    const harness = createService();
    const result = await harness.service.replace(1, { objetivos: [{ saborId: 10, litros: '0.125' }, { saborId: 30, litros: '2.5' }] });
    expect(result.objetivos.map((item) => [item.saborId, item.litros])).toEqual([[10, '0.125'], [30, '2.5']]);
    expect(harness.state().objetivos.some((item) => item.saborId === 20)).toBe(false);
    await expect(harness.service.replace(1, { objetivos: [{ saborId: 10, litros: '3' }] })).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.state().objetivos.find((item) => item.saborId === 10)?.litros.toString()).toBe('0.125');
  });

  it('rejects negative, over-precision, duplicate, missing and inactive references without writing', async () => {
    const harness = createService();
    const invalid = [
      [{ saborId: 10, litros: '-1' }],
      [{ saborId: 10, litros: '1.0001' }],
      [{ saborId: 10, litros: '100000000000' }],
      [{ saborId: 10, litros: '1' }, { saborId: 10, litros: '2' }],
      [{ saborId: 999, litros: '1' }],
      [{ saborId: 10, litros: '1' }, { saborId: 30, litros: '2.5' }, { saborId: 40, litros: '1' }],
    ];
    for (const objetivos of invalid) await expect(harness.service.replace(1, { objetivos })).rejects.toBeInstanceOf(BadRequestException);
    await expect(harness.service.replace(2, { objetivos: [] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(harness.service.replace(999, { objetivos: [] })).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.state().objetivos.map((item) => item.saborId)).toEqual([10, 30]);
  });

  it('compares only the exact confirmed date and shift, preserving absent values as null', async () => {
    const day = new Date('2100-01-02T00:00:00.000Z');
    const harness = createService({
      objetivos: [{ sucursalId: 1, saborId: 10, litros: new Prisma.Decimal('6.5'), createdAt: new Date(), updatedAt: new Date() }, { sucursalId: 1, saborId: 20, litros: new Prisma.Decimal('0'), createdAt: new Date(), updatedAt: new Date() }],
      reportes: [{ id: 1, sucursalId: 1, fecha: day, turno: TurnoInventarioSucursal.MATUTINO, estado: EstadoInventarioSucursal.CONFIRMADO, detalles: [{ saborId: 10, litros: new Prisma.Decimal('2.5') }] }],
    });
    const result = await harness.service.compare(1, '2100-01-02', TurnoInventarioSucursal.MATUTINO);
    expect(result.inventarioEstado).toBe('CONFIRMADO');
    expect(result.comparaciones.find((item) => item.saborId === 10)).toMatchObject({ objetivoLitros: '6.5', existenciaLitros: '2.5', diferenciaLitros: '4', objetivoConfigurado: true, existenciaRegistrada: true });
    expect(result.comparaciones.find((item) => item.saborId === 20)).toMatchObject({ objetivoLitros: '0', existenciaLitros: null, diferenciaLitros: null, objetivoConfigurado: true, existenciaRegistrada: false });
    expect((await harness.service.compare(1, '2100-01-02', TurnoInventarioSucursal.VESPERTINO)).inventarioEstado).toBe('AUSENTE');
  });

  it('does not expose draft details as existence and returns no objective as null', async () => {
    const harness = createService({
      objetivos: [],
      reportes: [{ id: 2, sucursalId: 1, fecha: new Date('2100-01-02T00:00:00Z'), turno: TurnoInventarioSucursal.MATUTINO, estado: EstadoInventarioSucursal.BORRADOR, detalles: [{ saborId: 10, litros: new Prisma.Decimal('4') }] }],
    });
    const result = await harness.service.compare(1, '2100-01-02', TurnoInventarioSucursal.MATUTINO);
    expect(result.inventarioEstado).toBe('BORRADOR');
    expect(result.inventarioId).toBeNull();
    expect(result.comparaciones.find((item) => item.saborId === 10)).toMatchObject({ objetivoLitros: null, existenciaLitros: null, diferenciaLitros: null, objetivoConfigurado: false, existenciaRegistrada: false });
  });
});
