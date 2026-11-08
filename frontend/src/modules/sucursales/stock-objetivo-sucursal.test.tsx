// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockObjetivoSucursalPage } from './StockObjetivoSucursalPage';

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; init?: RequestInit }>;
let saved: unknown;
const branches = [{ id: 1, nombre: 'Centro', activo: true, createdAt: '', updatedAt: '' }, { id: 2, nombre: 'Norte', activo: true, createdAt: '', updatedAt: '' }];
const flavors = [{ id: 10, nombre: 'Fresa' }, { id: 20, nombre: 'Nuez' }];
const inactiveObjective = { saborId: 30, sabor: 'Ciruela', saborActivo: false, litros: '2.5', createdAt: '', updatedAt: '' };
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
  calls = []; saved = null;
  vi.stubGlobal('confirm', vi.fn(() => false));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith('/sucursales')) return json(branches);
    if (url.endsWith('/sucursales/sabores')) return json(flavors);
    if (url.endsWith('/sucursales/1/stock-objetivo') && init?.method === 'PUT') {
      saved = JSON.parse(String(init.body));
      const body = saved as { objetivos: { saborId: number; litros: string }[] };
      return json({ sucursal: { id: 1, nombre: 'Centro', activo: true }, objetivos: body.objetivos.map((item) => ({ ...item, sabor: ({ 10: 'Fresa', 20: 'Nuez', 30: 'Ciruela' } as Record<number, string>)[item.saborId], saborActivo: item.saborId !== 30, createdAt: '', updatedAt: '' })) });
    }
    if (url.endsWith('/sucursales/1/stock-objetivo')) return json({ sucursal: { id: 1, nombre: 'Centro', activo: true }, objetivos: [{ saborId: 10, sabor: 'Fresa', saborActivo: true, litros: '0', createdAt: '', updatedAt: '' }, inactiveObjective] });
    if (url.includes('/stock-objetivo/comparacion?')) return json({ sucursal: { id: 1, nombre: 'Centro', activo: true }, fecha: '2026-11-07', turno: 'MATUTINO', inventarioEstado: 'CONFIRMADO', inventarioId: 5, comparaciones: [{ saborId: 10, sabor: 'Fresa', saborActivo: true, objetivoConfigurado: true, objetivoLitros: '0', existenciaRegistrada: true, existenciaLitros: '0.5', diferenciaLitros: '-0.5' }, { saborId: 20, sabor: 'Nuez', saborActivo: true, objetivoConfigurado: false, objetivoLitros: null, existenciaRegistrada: false, existenciaLitros: null, diferenciaLitros: null }] });
    return json({});
  }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Stock objetivo de sucursales UX', () => {
  it('distinguishes unconfigured from zero, preserves inactive objectives and compares one selected shift', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><StockObjetivoSucursalPage /></MemoryRouter></QueryClientProvider>));
    await flush(); await flush();
    const branch = container.querySelector('select') as HTMLSelectElement;
    await act(async () => setValue(branch, '1')); await flush(); await flush();
    expect(container.textContent).toContain('Sin objetivo configurado');
    expect(container.textContent).toContain('Objetivo explícito');
    expect(container.textContent).toContain('Ciruela');
    const fresa = container.querySelector('input[aria-label="Objetivo en litros para Fresa"]') as HTMLInputElement;
    expect(fresa.value).toBe('0');
    await act(async () => setValue(fresa, '3.125'));
    const saveButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Guardar objetivos base')!;
    await act(async () => saveButton.click()); await flush(); await flush();
    expect(saved).toEqual({ objetivos: [{ saborId: 10, litros: '3.125' }, { saborId: 30, litros: '2.5' }] });
    expect(container.textContent).toContain('Objetivos base guardados');

    const inputs = [...container.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    await act(async () => setValue(inputs[0], '2026-11-07'));
    const selects = [...container.querySelectorAll('select')] as HTMLSelectElement[];
    await act(async () => setValue(selects[1], 'MATUTINO')); await flush(); await flush();
    expect(calls.some(({ url }) => url.includes('/sucursales/1/stock-objetivo/comparacion?fecha=2026-11-07&turno=MATUTINO'))).toBe(true);
    expect(container.textContent).toContain('Snapshot confirmado');
    expect(container.textContent).toContain('0.5 L');
    expect(container.textContent).toContain('Sin objetivo');
    expect(container.textContent).toContain('No disponible');
    expect(container.textContent).toContain('No suma turnos');
  });

  it('warns before discarding unsaved changes when changing branch', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><StockObjetivoSucursalPage /></MemoryRouter></QueryClientProvider>));
    await flush(); await flush();
    await act(async () => setValue(container.querySelector('select') as HTMLSelectElement, '1')); await flush(); await flush();
    await act(async () => setValue(container.querySelector('input[aria-label="Objetivo en litros para Fresa"]') as HTMLInputElement, '1.5'));
    await act(async () => setValue(container.querySelector('select') as HTMLSelectElement, '2'));
    expect(vi.mocked(window.confirm)).toHaveBeenCalledOnce();
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('1');
  });
});
