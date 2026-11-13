// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCsrfMock } from '../../test-utils';
import { CapturaInventarioPage } from './CapturaInventarioPage';
import { ConsultaInventarioPage } from './ConsultaInventarioPage';

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; init?: RequestInit }>;
let report: Record<string, unknown> | null;
const catalogs = { fecha: '2026-11-06', timezone: 'America/Mexico_City', sucursales: [{ id: 1, nombre: 'Centro', horarios: { MATUTINO: '08:00–14:30', VESPERTINO: '16:30–21:00' } }], sabores: [{ id: 2, nombre: 'Fresa' }, { id: 3, nombre: 'Nuez' }] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

function setValue(input: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  calls = []; report = null;
  vi.stubGlobal('fetch', withCsrfMock(vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith('/inventario-sucursales/captura')) return json(catalogs);
    if (url.includes('/inventario-sucursales/reporte?')) return json({ fecha: '2026-11-06', reporte: report });
    if (url.endsWith('/inventario-sucursales/reportes') && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { sucursalId: number; fecha: string; turno: string; detalles: { saborId: number; litros: string }[] };
      report = { id: 5, sucursalId: body.sucursalId, turno: body.turno, fecha: body.fecha, estado: 'BORRADOR', confirmadoAt: null, createdAt: '2026-11-06T18:00:00.000Z', updatedAt: '2026-11-06T18:00:00.000Z', detalles: body.detalles.map((item) => ({ ...item, sabor: catalogs.sabores.find((sabor) => sabor.id === item.saborId)?.nombre })) };
      return json(report);
    }
    if (url.endsWith('/reportes/5/confirmacion')) { report = { ...report!, estado: 'CONFIRMADO', confirmadoAt: '2026-11-06T20:00:00.000Z' }; return json(report); }
    if (url.endsWith('/inventario-sucursales') || url.includes('/inventario-sucursales?')) return json({ fecha: '2026-11-06', turno: new URL(url, 'http://local').searchParams.get('turno') || 'MATUTINO', timezone: catalogs.timezone, ultimoInventarioConfirmadoPorSucursal: [{ sucursalId: 1, sucursal: 'Centro', activo: true, reporte: null }], historicosAnterioresSinTurno: [], sucursalesPendientes: [{ id: 2, nombre: 'Norte', activo: true }], sucursales: [{ id: 4, sucursalId: 1, sucursal: 'Centro', fecha: '2026-11-06', estado: 'CONFIRMADO', confirmadoAt: '2026-11-06T20:00:00.000Z', createdAt: '2026-11-06T18:00:00.000Z', updatedAt: '2026-11-06T20:00:00.000Z', detalles: [{ saborId: 2, sabor: 'Fresa', litros: '0.5' }] }], consolidado: [{ saborId: 2, sabor: 'Fresa', litros: '0.5' }] });
    return json({});
  })));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Inventario por turno de sucursales UX', () => {
  it('uses the server date, saves an exact decimal draft, reviews, and confirms immutable', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><CapturaInventarioPage /></MemoryRouter></QueryClientProvider>));
    await flush(); await flush();
    expect(calls[0].url).toMatch(/\/inventario-sucursales\/captura$/);
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-11-06');
    const selects = [...container.querySelectorAll('select')] as HTMLSelectElement[];
    await act(async () => setValue(selects[0], 'MATUTINO'));
    await act(async () => setValue(([...container.querySelectorAll('select')] as HTMLSelectElement[])[1], '1'));
    await flush(); await flush();
    await act(async () => setValue(([...container.querySelectorAll('select')] as HTMLSelectElement[])[2], '2'));
    const litersInput = ([...container.querySelectorAll('input[type="number"]')] as HTMLInputElement[])[0];
    await act(async () => setValue(litersInput, '2.5'));
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Agregar sabor')!;
    await act(async () => add.click());
    const save = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Guardar borrador')!;
    await act(async () => save.click()); await flush(); await flush();
    const put = calls.find((call) => call.url.endsWith('/inventario-sucursales/reportes') && call.init?.method === 'PUT');
    expect(JSON.parse(String(put?.init?.body))).toMatchObject({ fecha: '2026-11-06', sucursalId: 1, turno: 'MATUTINO', detalles: [{ saborId: 2, litros: '2.5' }] });
    expect(container.textContent).toContain('Horario informativo: 08:00–14:30');
    expect(container.textContent).toContain('La captura permanece disponible fuera de horario.');
    expect(container.textContent).toContain('Borrador editable');
    const confirm = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Confirmar inventario')!;
    expect(confirm.disabled).toBe(false);
    const detailInput = container.querySelector('input[aria-label="Litros de Fresa"]') as HTMLInputElement;
    await act(async () => setValue(detailInput, '3.5'));
    const confirmWhileDirty = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Confirmar inventario')!;
    expect(confirmWhileDirty.disabled).toBe(true);
    const resave = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Guardar borrador')!;
    await act(async () => resave.click()); await flush(); await flush();
    const latestPut = calls.filter((call) => call.url.endsWith('/inventario-sucursales/reportes') && call.init?.method === 'PUT').at(-1);
    expect(JSON.parse(String(latestPut?.init?.body)).detalles).toEqual([{ saborId: 2, litros: '3.5' }]);
    await flush();
    const confirmAfterSave = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Confirmar inventario')!;
    expect(confirmAfterSave.disabled).toBe(false);
    await act(async () => confirmAfterSave.click()); await flush(); await flush();
    expect(container.textContent).toContain('Confirmado · inmutable');
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).disabled).toBe(true);
  });

  it('shows pending branches and confirmed totals without assigning zero to absent flavors', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><ConsultaInventarioPage /></MemoryRouter></QueryClientProvider>));
    await flush();
    await act(async () => setValue(container.querySelector('select') as HTMLSelectElement, 'MATUTINO'));
    await flush(); await flush();
    expect(calls.some((call) => call.url.includes('/inventario-sucursales?turno=MATUTINO'))).toBe(true);
    expect(container.textContent).toContain('Norte');
    expect(container.textContent).toContain('Centro');
    expect(container.textContent).toContain('0.5 L');
    expect(container.textContent).not.toContain('Nuez 0 L');
    expect(container.textContent).toContain('Solo incluye filas explícitas confirmadas');
    expect(container.textContent).toContain('Último inventario confirmado por sucursal');
  });
});
