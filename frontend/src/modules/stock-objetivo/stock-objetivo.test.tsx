// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cliente } from '../../shared/api/clientes';
import type { StockObjetivoItem } from '../../shared/api/stock-objetivo';
import { StockObjetivoPage } from './StockObjetivoPage';

const initial: Cliente = { id: 1, nombre: 'Punto Fresco', celular: '', direccion: '', manejaMedioLitro: true, activo: true, createdAt: '', updatedAt: '' };
const sabores = [{ id: 1, nombre: 'Fresa', activo: true }, { id: 2, nombre: 'Nuez', activo: false }];
const presentaciones = [
  { presentacionId: 1, nombre: '1 litro', litrosEquivalentes: 1, habilitada: true },
  { presentacionId: 2, nombre: '1/2 litro', litrosEquivalentes: 0.5, habilitada: true },
];
let container: HTMLDivElement;
let root: Root;
let cliente: Cliente;
let stock: StockObjetivoItem[];
let getCalls: number;
let failStock: boolean;
let medioHabilitado: boolean;
let presentationCalls: number;
let fetchMock: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const details = () => stock.map((item) => ({ ...item, clienteId: 1, sabor: sabores[0], presentacion: presentaciones.find((p) => p.presentacionId === item.presentacionId), createdAt: '', updatedAt: '' }));
const button = (name: string) => {
  const found = [...container.querySelectorAll('button')].find((node) => node.textContent?.trim() === name);
  if (!found) throw new Error(`No se encontró ${name}`);
  return found;
};
const checkbox = (name: string) => {
  const found = [...container.querySelectorAll('label')].find((node) => node.textContent?.trim() === name)?.querySelector('input');
  if (!(found instanceof HTMLInputElement)) throw new Error(`No se encontró ${name}`);
  return found;
};
const amount = (name: string) => {
  const found = container.querySelector(`input[aria-label="Stock objetivo de Fresa, ${name}"]`);
  if (!(found instanceof HTMLInputElement)) throw new Error(`No se encontró stock de ${name}`);
  return found;
};
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const click = async (name: string) => { await act(async () => { button(name).click(); }); await flush(); };
const check = async (name: string) => { await act(async () => { checkbox(name).click(); }); };
const fill = async (name: string, value: string) => {
  await act(async () => {
    const field = amount(name);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
async function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  queryClient = client;
  await act(async () => { root.render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/admin/clientes/1/stock-objetivo']}><Routes><Route path="/admin/clientes/:clienteId/stock-objetivo" element={<StockObjetivoPage />} /></Routes></MemoryRouter></QueryClientProvider>); });
  for (let index = 0; index < 5; index++) await flush();
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  cliente = { ...initial }; stock = []; getCalls = 0; failStock = false; medioHabilitado = true; presentationCalls = 0;
  fetchMock = vi.fn(async (resource: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (resource.endsWith('/clientes/1') && method === 'GET') return json(cliente);
    if (resource.endsWith('/clientes/1/stock-objetivo') && method === 'GET') { getCalls++; return failStock ? json({ message: 'Sin conexión' }, 503) : json(details()); }
    if (resource.endsWith('/clientes/1/stock-objetivo') && method === 'PUT') {
      stock = (JSON.parse(init?.body as string) as { combinaciones: StockObjetivoItem[] }).combinaciones;
      return json(details());
    }
    if (resource.endsWith('/sabores') && method === 'GET') return json(sabores);
    if (resource.endsWith('/sabores/1/presentaciones') && method === 'GET') { presentationCalls++; return json(presentaciones.map((item) => item.presentacionId === 2 ? { ...item, habilitada: medioHabilitado } : item)); }
    return json({ message: 'No encontrado' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('StockObjetivoPage', () => {
  it('shows loading while the client request is pending', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    await renderPage();
    expect(container.textContent).toContain('Cargando stock objetivo');
    await act(async () => { resolve(json(cliente)); });
    for (let index = 0; index < 5; index++) await flush();
    expect(container.textContent).toContain('todavía no tiene stock objetivo');
  });

  it('shows an error and retries the stock request', async () => {
    failStock = true;
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Sin conexión');
    failStock = false;
    await click('Reintentar');
    expect(container.textContent).toContain('todavía no tiene stock objetivo');
  });

  it('configures zero and another amount, saves the full assortment and refetches', async () => {
    await renderPage();
    expect(container.textContent).toContain('Punto Fresco');
    expect(container.textContent).toContain('Desmarcado: fuera del surtido');
    expect(checkbox('1 litro').checked).toBe(false);
    expect(checkbox('1/2 litro').checked).toBe(false);
    expect(container.textContent).not.toContain('Nuez');
    await check('1 litro');
    await check('1/2 litro');
    expect(amount('1 litro').value).toBe('0');
    await fill('1/2 litro', '6');
    await click('Guardar stock objetivo');
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put?.[0]).toBe('http://localhost:3000/api/clientes/1/stock-objetivo');
    expect(JSON.parse(put?.[1]?.body as string)).toEqual({ combinaciones: [
      { saborId: 1, presentacionId: 1, cantidad: 0 }, { saborId: 1, presentacionId: 2, cantidad: 6 },
    ] });
    expect(getCalls).toBeGreaterThanOrEqual(2);
    expect(checkbox('1 litro').checked).toBe(true);
    expect(amount('1/2 litro').value).toBe('6');
    expect(container.textContent).toContain('Stock objetivo guardado.');
  });

  it('excludes a combination from the full replacement', async () => {
    stock = [{ saborId: 1, presentacionId: 1, cantidad: 4 }, { saborId: 1, presentacionId: 2, cantidad: 2 }];
    await renderPage();
    await check('1/2 litro');
    await click('Guardar stock objetivo');
    expect(stock).toEqual([{ saborId: 1, presentacionId: 1, cantidad: 4 }]);
    expect(checkbox('1/2 litro').checked).toBe(false);
    expect(amount('1 litro').value).toBe('4');
  });

  it('rejects negatives in the form without sending PUT', async () => {
    await renderPage();
    await check('1 litro');
    await fill('1 litro', '-1');
    await click('Guardar stock objetivo');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('entero no negativo');
  });

  it('hides half-liter for clients who do not handle it and inactive flavors', async () => {
    cliente.manejaMedioLitro = false;
    await renderPage();
    expect(checkbox('1 litro')).toBeTruthy();
    expect(container.textContent).not.toContain('1/2 litro');
    expect(container.textContent).not.toContain('Nuez');
  });

  it('hides presentations disabled for a flavor', async () => {
    medioHabilitado = false;
    await renderPage();
    expect(checkbox('1 litro')).toBeTruthy();
    expect(container.textContent).not.toContain('1/2 litro');
  });

  it('syncs a pristine form and warns before discarding dirty edits after a stock refetch', async () => {
    stock = [{ saborId: 1, presentacionId: 1, cantidad: 4 }];
    await renderPage();
    expect(amount('1 litro').value).toBe('4');
    stock = [{ saborId: 1, presentacionId: 1, cantidad: 8 }];
    await act(async () => { queryClient.setQueryData(['stock-objetivo', 1], details()); });
    await flush();
    expect(amount('1 litro').value).toBe('8');
    await fill('1 litro', '9');
    stock = [{ saborId: 1, presentacionId: 1, cantidad: 11 }];
    await act(async () => { queryClient.setQueryData(['stock-objetivo', 1], details()); });
    await flush();
    expect(amount('1 litro').value).toBe('9');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('La configuración cambió');
    expect(button('Guardar stock objetivo').disabled).toBe(true);
    await click('Recargar configuración');
    expect(amount('1 litro').value).toBe('11');
    expect(button('Guardar stock objetivo').disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('refetches cached presentations on entry and responds to catalog invalidation', async () => {
    const cached = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    cached.setQueryData(['sabores'], sabores);
    cached.setQueryData(['sabores', 1, 'presentaciones'], presentaciones);
    medioHabilitado = false;
    await renderPage(cached);
    expect(presentationCalls).toBeGreaterThanOrEqual(1);
    expect(container.textContent).not.toContain('1/2 litro');
    medioHabilitado = true;
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['sabores', 1, 'presentaciones'] }); });
    expect(checkbox('1/2 litro')).toBeTruthy();
  });

  it('preserves a dirty draft and warns when catalog availability changes', async () => {
    await renderPage();
    await check('1 litro');
    medioHabilitado = false;
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['sabores', 1, 'presentaciones'] }); });
    expect(checkbox('1 litro').checked).toBe(true);
    expect(container.textContent).not.toContain('1/2 litro');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('La configuración cambió');
    expect(button('Guardar stock objetivo').disabled).toBe(true);
    await click('Recargar configuración');
    expect(checkbox('1 litro').checked).toBe(false);
  });
});
