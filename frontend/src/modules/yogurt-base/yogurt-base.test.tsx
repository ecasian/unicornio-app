// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCsrfMock } from '../../test-utils';
import { YogurtBasePage } from './YogurtBasePage';

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; init?: RequestInit }>;
let apiFetchMock: ReturnType<typeof vi.fn>;
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
const empty = { fecha: '2026-11-06', timezone: 'America/Mexico_City', reglasPendientes: [], lotes: [], resumen: { litrosBaseDisponibles: 0, litrosBaseProcesados: 0, litrosAcondicionadosObtenidos: 0 }, saboresDestino: [{ id: 1, nombre: 'Fresa' }], necesidadesSucursalReferencia: [] };
const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  calls = [];
  apiFetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.includes('/yogurt-base?')) return json(empty);
    return json({ id: 1 });
  });
  vi.stubGlobal('fetch', withCsrfMock(apiFetchMock));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('YogurtBasePage', () => {
  it('localizes connection failures and retries the API query', async () => {
    apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><YogurtBasePage /></MemoryRouter></QueryClientProvider>));
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('No se pudo conectar con la API');
    const retry = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Reintentar');
    expect(retry).toBeTruthy();
    await act(async () => retry?.click());
    await flush(); await flush();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('YogurtBase y acondicionamiento');
  });

  it('shows date, lot entry, conditioning and reference workflows', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><YogurtBasePage /></MemoryRouter></QueryClientProvider>));
    await flush();
    expect(container.textContent).toContain('YogurtBase es distinto del sabor Natural');
    expect(container.textContent).toContain('Alertas y reglas pendientes');
    expect(container.textContent).toContain('Necesidades confirmadas de sucursales');
    const form = container.querySelector('form')!;
    const inputs = [...form.querySelectorAll('input')];
    for (const [input, value] of [[inputs[1], '2'], [inputs[2], '1'], [inputs[3], '0'], [inputs[4], '23']] as const) {
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
    }
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush();
    expect(calls.some((call) => call.url.endsWith('/yogurt-base/lotes') && call.init?.method === 'POST')).toBe(true);
    expect(calls.some((call) => call.url.endsWith('/yogurt-base/acondicionamientos'))).toBe(false);
  });
});
