import { describe, expect, it, vi } from 'vitest';
import { EstadoConcentradoSucursal } from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../db/prisma.service.js';
import { GuardarNecesidadDto } from './dto/necesidad.dto.js';
import { SucursalesService } from './sucursales.service.js';

type State = {
  sucursales: { id: number; nombre: string; activo: boolean }[];
  sabores: { id: number; nombre: string; activo: boolean }[];
  concentrados: { id: number; fecha: Date }[];
  necesidades: { id: number; concentradoId: number; sucursalId: number; estado: EstadoConcentradoSucursal; confirmadoAt: Date | null }[];
  detalles: { necesidadSucursalId: number; saborId: number; capacidadLitros: number; cantidad: number }[];
};

function createHarness(initial?: Partial<State>) {
  let state: State = {
    sucursales: [], sabores: [], concentrados: [], necesidades: [], detalles: [], ...initial,
  };
  let nextId = 1;
  let failCreateMany = false;
  let failNextTransaction = false;
  let lock: Promise<void> = Promise.resolve();
  const getSucursal = (id: number, source: State = state) => source.sucursales.find((item) => item.id === id);
  const getSabor = (id: number, source: State = state) => source.sabores.find((item) => item.id === id);
  const getDetalle = (detail: State['detalles'][number], source: State = state) => ({ ...detail, sabor: getSabor(detail.saborId, source) });
  const report = (id: number, source: State = state) => {
    const need = source.necesidades.find((item) => item.id === id);
    if (!need) return null;
    return { ...need, sucursal: getSucursal(need.sucursalId, source), detalles: source.detalles.filter((item) => item.necesidadSucursalId === id).map((item) => getDetalle(item, source)) };
  };
  const bind = (draft: State) => {
    const tx = {
      sucursal: {
        findUnique: async ({ where }: { where: { id: number } }) => draft.sucursales.find((item) => item.id === where.id) ?? null,
        findMany: async () => draft.sucursales,
      },
      sabor: {
        findMany: async ({ where }: { where: { id: { in: number[] }; activo: boolean } }) => draft.sabores.filter((item) => where.id.in.includes(item.id) && item.activo).map(({ id }) => ({ id })),
      },
      concentradoSucursales: {
        upsert: async ({ where, create }: { where: { fecha: Date }; create: { fecha: Date }; update: object }) => {
          let item = draft.concentrados.find((value) => value.fecha.getTime() === where.fecha.getTime());
          if (!item) { item = { id: nextId++, fecha: create.fecha }; draft.concentrados.push(item); }
          return item;
        },
        findUnique: async ({ where }: { where: { fecha: Date } }) => {
          const concentrado = draft.concentrados.find((item) => item.fecha.getTime() === where.fecha.getTime());
          return concentrado ? { ...concentrado, necesidades: draft.necesidades.filter((need) => need.concentradoId === concentrado.id && need.estado === EstadoConcentradoSucursal.CONFIRMADO).map((need) => report(need.id, draft)) } : null;
        },
      },
      necesidadSucursal: {
        findUnique: async ({ where }: { where: { concentradoId_sucursalId?: { concentradoId: number; sucursalId: number }; id?: number } }) => {
          const item = where.id !== undefined ? draft.necesidades.find((need) => need.id === where.id) : draft.necesidades.find((need) => need.concentradoId === where.concentradoId_sucursalId?.concentradoId && need.sucursalId === where.concentradoId_sucursalId.sucursalId);
          return item ? report(item.id, draft) : null;
        },
        create: async ({ data }: { data: { concentradoId: number; sucursalId: number } }) => {
          const item = { id: nextId++, ...data, estado: EstadoConcentradoSucursal.BORRADOR, confirmadoAt: null };
          draft.necesidades.push(item); return item;
        },
        findUniqueOrThrow: async ({ where }: { where: { id: number } }) => report(where.id, draft),
        update: async ({ where, data }: { where: { id: number }; data: Partial<State['necesidades'][number]> }) => {
          const item = draft.necesidades.find((need) => need.id === where.id)!;
          Object.assign(item, data); return report(item.id, draft);
        },
      },
      detalleNecesidadSucursal: {
        deleteMany: async ({ where }: { where: { necesidadSucursalId: number } }) => {
          draft.detalles = draft.detalles.filter((item) => item.necesidadSucursalId !== where.necesidadSucursalId);
        },
        createMany: async ({ data }: { data: State['detalles'] }) => {
          if (failCreateMany) throw new Error('Simulated detail insert failure');
          draft.detalles.push(...data); return { count: data.length };
        },
      },
    };
    return tx;
  };
  const prisma = {
    sucursal: { findMany: async () => state.sucursales },
    concentradoSucursales: { findUnique: async ({ where }: { where: { fecha: Date } }) => {
      const item = state.concentrados.find((value) => value.fecha.getTime() === where.fecha.getTime());
      return item ? { ...item, necesidades: state.necesidades.filter((need) => need.concentradoId === item.id && need.estado === EstadoConcentradoSucursal.CONFIRMADO).map((need) => report(need.id)) } : null;
    } },
    necesidadSucursal: { findUnique: async ({ where }: { where: { concentradoId_sucursalId: { concentradoId: number; sucursalId: number } } }) => {
      const item = state.necesidades.find((need) => need.concentradoId === where.concentradoId_sucursalId.concentradoId && need.sucursalId === where.concentradoId_sucursalId.sucursalId);
      return item ? { ...item, detalles: state.detalles.filter((detail) => detail.necesidadSucursalId === item.id) } : null;
    } },
    $transaction: async <T>(callback: (tx: never) => Promise<T>) => {
      let release!: () => void;
      const previous = lock;
      lock = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const draft = structuredClone(state);
      try {
        if (failNextTransaction) {
          failNextTransaction = false;
          throw Object.assign(new Error('Simulated Prisma serialization conflict'), { code: 'P2034' });
        }
        const result = await callback(bind(draft) as never);
        state = draft;
        return result;
      } finally { release(); }
    },
  };
  return {
    service: new SucursalesService(prisma as unknown as PrismaService, { get: () => 'America/Mexico_City' } as unknown as ConfigService),
    setFailCreateMany: (value: boolean) => { failCreateMany = value; },
    setFailNextTransaction: () => { failNextTransaction = true; },
    snapshot: () => structuredClone(state),
  };
}

const oneDetail = (overrides: Partial<GuardarNecesidadDto['detalles'][number]> = {}) => ({ saborId: 7, capacidadLitros: 10, cantidad: 2, ...overrides });
const draft = (detalles = [oneDetail()]): GuardarNecesidadDto => ({ fecha: '2026-11-04', detalles });
const seeded = () => createHarness({ sucursales: [{ id: 1, nombre: 'Sucursal de prueba', activo: true }], sabores: [{ id: 7, nombre: 'Fresa de prueba', activo: true }] });

describe('SucursalesService', () => {
  it('defaults to today in BUSINESS_TIMEZONE and returns the timezone', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T02:00:00.000Z'));
    try {
      const result = await createHarness().service.consultar();
      expect(result.fecha).toBe('2026-11-04');
      expect(result.timezone).toBe('America/Mexico_City');
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts with an empty sucursal catalog and never seeds names', async () => {
    const harness = createHarness();
    expect(await harness.service.listSucursales()).toEqual([]);
  });

  it.each([4, 6, 10])('accepts capacity %i and calculates equivalent liters', async (capacidadLitros) => {
    const harness = seeded();
    await harness.service.guardarNecesidad(1, draft([oneDetail({ capacidadLitros, cantidad: 3 })]));
    const report = await harness.service.consultar('2026-11-04');
    expect(report.sucursales).toHaveLength(0);
    await harness.service.confirmar(1, '2026-11-04');
    const confirmed = await harness.service.consultar('2026-11-04');
    expect(confirmed.sucursales[0].detalles[0]).toMatchObject({ capacidadLitros, cantidad: 3, litrosEquivalentes: capacidadLitros * 3 });
  });

  it('accepts an explicit zero need', async () => {
    const harness = seeded();
    await harness.service.guardarNecesidad(1, draft([oneDetail({ cantidad: 0 })]));
    expect(harness.snapshot().detalles[0].cantidad).toBe(0);
  });

  it.each([[-1, 10, 2], [1.5, 10, 2], [2, 5, 2], [2, 10, 1.5]])('rejects invalid quantity or capacity %#', async (saborId, capacidadLitros, cantidad) => {
    const harness = seeded();
    await expect(harness.service.guardarNecesidad(1, draft([oneDetail({ saborId, capacidadLitros, cantidad })]))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate flavor/capacity combinations and preserves the draft', async () => {
    const harness = seeded();
    await expect(harness.service.guardarNecesidad(1, draft([oneDetail(), oneDetail()]))).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.snapshot().concentrados).toHaveLength(0);
  });

  it('creates one report per date and branch, then replaces draft details on update', async () => {
    const harness = seeded();
    const first = await harness.service.guardarNecesidad(1, draft([oneDetail({ cantidad: 2 })]));
    const second = await harness.service.guardarNecesidad(1, draft([oneDetail({ cantidad: 4 })]));
    expect(second.id).toBe(first.id);
    expect(harness.snapshot().concentrados).toHaveLength(1);
    expect(harness.snapshot().necesidades).toHaveLength(1);
    expect(harness.snapshot().detalles).toHaveLength(1);
    expect(harness.snapshot().detalles[0].cantidad).toBe(4);
  });

  it('keeps reports unique by branch within a date but separate across branches and dates', async () => {
    const harness = createHarness({
      sucursales: [{ id: 1, nombre: 'Uno', activo: true }, { id: 2, nombre: 'Dos', activo: true }],
      sabores: [{ id: 7, nombre: 'Fresa', activo: true }],
    });
    await harness.service.guardarNecesidad(1, draft());
    await harness.service.guardarNecesidad(2, draft());
    await harness.service.guardarNecesidad(1, { ...draft(), fecha: '2026-11-05' });
    expect(harness.snapshot().concentrados).toHaveLength(2);
    expect(harness.snapshot().necesidades).toHaveLength(3);
  });

  it('confirms a saved report and refuses later modifications or confirmation replay', async () => {
    const harness = seeded();
    await harness.service.guardarNecesidad(1, draft());
    const confirmed = await harness.service.confirmar(1, '2026-11-04');
    expect(confirmed.estado).toBe(EstadoConcentradoSucursal.CONFIRMADO);
    await expect(harness.service.guardarNecesidad(1, draft([oneDetail({ cantidad: 9 })]))).rejects.toBeInstanceOf(ConflictException);
    await expect(harness.service.confirmar(1, '2026-11-04')).rejects.toBeInstanceOf(ConflictException);
  });

  it('consolidates confirmed reports only and identifies pending branches', async () => {
    const harness = createHarness({
      sucursales: [{ id: 1, nombre: 'Uno', activo: true }, { id: 2, nombre: 'Dos', activo: true }],
      sabores: [{ id: 7, nombre: 'Fresa', activo: true }],
    });
    await harness.service.guardarNecesidad(1, draft());
    await harness.service.guardarNecesidad(2, draft([oneDetail({ capacidadLitros: 6, cantidad: 5 })]));
    let result = await harness.service.consultar('2026-11-04');
    expect(result.consolidado).toEqual([]);
    expect(result.sucursalesSinConfirmar).toHaveLength(2);
    await harness.service.confirmar(1, '2026-11-04');
    result = await harness.service.consultar('2026-11-04');
    expect(result.consolidado).toEqual([{ saborId: 7, sabor: 'Fresa', capacidadLitros: 10, cantidad: 2, litrosEquivalentes: 20 }]);
    expect(result.sucursalesSinConfirmar.map(({ id }) => id)).toEqual([2]);
  });

  it('serializes a concurrent save and confirmation without allowing post-confirmation changes', async () => {
    const harness = seeded();
    await harness.service.guardarNecesidad(1, draft());
    const outcomes = await Promise.allSettled([
      harness.service.guardarNecesidad(1, draft([oneDetail({ cantidad: 8 })])),
      harness.service.confirmar(1, '2026-11-04'),
    ]);
    expect(outcomes.some((item) => item.status === 'fulfilled')).toBe(true);
    const stored = harness.snapshot();
    expect(stored.necesidades[0].estado).toBe(EstadoConcentradoSucursal.CONFIRMADO);
    expect(stored.detalles).toHaveLength(1);
    expect([2, 8]).toContain(stored.detalles[0].cantidad);
  });

  it('maps a Prisma serialization conflict to an explicit conflict response', async () => {
    const harness = seeded();
    harness.setFailNextTransaction();
    await expect(harness.service.guardarNecesidad(1, draft())).rejects.toBeInstanceOf(ConflictException);
  });

  it('rolls back the concentration and header when inserting details fails', async () => {
    const harness = seeded();
    harness.setFailCreateMany(true);
    await expect(harness.service.guardarNecesidad(1, draft())).rejects.toThrow('Simulated detail insert failure');
    expect(harness.snapshot()).toMatchObject({ concentrados: [], necesidades: [], detalles: [] });
  });
});
