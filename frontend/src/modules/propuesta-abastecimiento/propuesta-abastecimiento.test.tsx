// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropuestaAbastecimientoPage } from './PropuestaAbastecimientoPage';
import type { PropuestaAbastecimiento } from '../../shared/api/propuestas-abastecimiento';

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; init?: RequestInit }>;
let proposal: PropuestaAbastecimiento;
let created: boolean;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
function setValue(input: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  calls = [];
  created = false;
  proposal = { id: 8, sucursalId: 1, sucursal: { id: 1, nombre: 'Centro', activo: true }, fecha: '2026-11-09', timezone: 'America/Mexico_City', version: 1, estado: 'BORRADOR', obsoleta: false, fuente: { reporteId: 7, fecha: '2026-11-08', turno: 'VESPERTINO', confirmadoAt: '' }, creadaAt: '', confirmadaAt: null, detalles: [
    { saborId: 10, sabor: 'Fresa', saborActivo: true, estadoReferencia: 'DISPONIBLE', objetivoLitros: '10', objetivoActualizadoAt: '', existenciaLitros: '6.5', sugerenciaLitros: '3.5', decisionLitros: '3.5' },
    { saborId: 20, sabor: 'Natural', saborActivo: true, estadoReferencia: 'SIN_DATOS', objetivoLitros: null, objetivoActualizadoAt: null, existenciaLitros: '0', sugerenciaLitros: null, decisionLitros: null },
  ] };
  vi.stubGlobal('confirm', vi.fn(() => false));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith('/sucursales')) return json([{ id: 1, nombre: 'Centro', activo: true }]);
    if (url.includes('/propuestas-abastecimiento?')) return json({ timezone: 'America/Mexico_City', propuestas: created ? [proposal] : [] });
    if (url.endsWith('/propuestas-abastecimiento') && init?.method === 'POST') { created = true; return json(proposal, 201); }
    if (url.endsWith('/decisiones') && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { decisiones: { saborId: number; decisionLitros: string | null }[] };
      proposal = { ...proposal, detalles: proposal.detalles.map((item) => ({ ...item, decisionLitros: body.decisiones.find((decision) => decision.saborId === item.saborId)?.decisionLitros ?? item.decisionLitros })) };
      return json(proposal);
    }
    if (url.endsWith('/confirmacion') && init?.method === 'POST') { proposal = { ...proposal, estado: 'CONFIRMADA', confirmadaAt: '2026-11-09T16:00:00.000Z' }; return json(proposal, 201); }
    if (/\/propuestas-abastecimiento\/\d+$/.test(url)) return json(proposal);
    return json({});
  }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Propuesta diaria UX', () => {
  it('shows source and SIN DATOS, saves an explicit manual amount, and confirms without creating an order', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><PropuestaAbastecimientoPage /></MemoryRouter></QueryClientProvider>));
    await flush();
    await act(async () => setValue(container.querySelector('input[type="date"]') as HTMLInputElement, '2026-11-09')); await flush();
    expect(container.textContent).toContain('Aún no hay propuestas para esta fecha.');
    await act(async () => setValue(container.querySelector('select') as HTMLSelectElement, '1'));
    const create = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Crear / nueva versión'))!;
    await act(async () => create.click()); await flush(); await flush();
    expect(container.textContent).toContain('Sugerencia');
    expect(container.textContent).toContain('3.5 L');
    expect(container.textContent).toContain('SIN DATOS');
    const natural = container.querySelector('input[aria-label="Cantidad decidida en litros para Natural"]') as HTMLInputElement;
    await act(async () => setValue(natural, '1.25'));
    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    await act(async () => setValue(date, '2026-11-10'));
    expect(vi.mocked(window.confirm)).toHaveBeenCalledOnce();
    expect(date.value).toBe('2026-11-09');
    const save = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Guardar borrador')!;
    await act(async () => save.click()); await flush(); await flush();
    expect(calls.some((call) => call.url.endsWith('/decisiones') && call.init?.method === 'PUT')).toBe(true);
    const activeProposal = [...container.querySelectorAll('section')].find((section) => section.textContent?.includes('Centro · 2026-11-09 · versión 1'))!;
    expect(activeProposal.querySelector('[role="status"]')?.textContent).toBe('Decisiones guardadas en el borrador.');
    await act(async () => setValue(natural, '2'));
    expect(activeProposal.querySelector('[role="status"]')).toBeNull();
    const saveAgain = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Guardar borrador')!;
    await act(async () => saveAgain.click()); await flush(); await flush();
    expect(activeProposal.querySelector('[role="status"]')?.textContent).toBe('Decisiones guardadas en el borrador.');
    const confirm = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Confirmar propuesta')!;
    await act(async () => confirm.click()); await flush(); await flush();
    expect(activeProposal.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(activeProposal.querySelector('[role="status"]')?.textContent).toBe('Propuesta confirmada e inmutable.');
    expect(container.textContent).toContain('Estado: CONFIRMADA');
    expect(calls.some((call) => /pedidos|inventario-sucursales|concentrado/.test(call.url))).toBe(false);
  });

  it('shows loading and API error states', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'API no disponible' }, 503)));
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><PropuestaAbastecimientoPage /></MemoryRouter></QueryClientProvider>));
    expect(container.textContent).toContain('Cargando sucursales');
    await flush(); await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('API no disponible');
  });
});
