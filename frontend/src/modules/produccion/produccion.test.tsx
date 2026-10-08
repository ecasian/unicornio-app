// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProduccionPage } from './ProduccionPage';

const payload = {
  fecha: '2026-10-05', timezone: 'America/Mexico_City',
  tiendas: [{ clienteId: 1, cliente: 'Tienda Centro', pedidos: [
    { pedidoProduccionId: 11, registroExistenciasId: 21, visitaClienteId: 31, llegadaAt: '2026-10-05T16:00:00.000Z', repartidorId: 4, repartidor: 'Carlos', detalles: [{ saborId: 2, sabor: 'Fresa', presentacionId: 1, presentacion: '1 litro', cantidad: 6 }] },
    { pedidoProduccionId: 12, registroExistenciasId: 22, visitaClienteId: 32, llegadaAt: '2026-10-05T18:00:00.000Z', repartidorId: 4, repartidor: 'Carlos', detalles: [{ saborId: 2, sabor: 'Fresa', presentacionId: 2, presentacion: '1/2 litro', cantidad: 3 }] },
  ] }],
  consolidado: [
    { saborId: 2, sabor: 'Fresa', presentacionId: 1, presentacion: '1 litro', cantidad: 6 },
    { saborId: 2, sabor: 'Fresa', presentacionId: 2, presentacion: '1/2 litro', cantidad: 3 },
  ],
};
let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const renderPage = async () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => { root.render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/produccion']}><Routes><Route path="/produccion" element={<ProduccionPage />} /></Routes></MemoryRouter></QueryClientProvider>); });
  for (let i = 0; i < 5; i++) await flush();
};
const click = async (label: string) => {
  const button = [...container.querySelectorAll('button')].find((element) => element.textContent?.trim() === label);
  if (!button) throw new Error(`No se encontró el botón ${label}`);
  await act(async () => { button.click(); });
  await flush();
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  fetchMock = vi.fn(async () => json(payload));
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});

afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('ProduccionPage', () => {
  it('shows loading before the server response', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    await act(async () => { root.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/produccion']}><Routes><Route path="/produccion" element={<ProduccionPage />} /></Routes></MemoryRouter></QueryClientProvider>); });
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Cargando');
    await act(async () => { resolve(json(payload)); });
    await flush();
    expect(container.textContent).toContain('Tienda Centro');
  });

  it('renders separate visits, product details and the server-provided consolidation', async () => {
    await renderPage();
    expect(container.textContent).toContain('Por tienda');
    expect(container.textContent).toContain('Tienda Centro');
    expect(container.textContent).toContain('Carlos');
    expect(container.textContent).toContain('Fresa · 1 litro');
    expect(container.textContent).toContain('Fresa · 1/2 litro');
    expect(container.textContent).toContain('Consolidado');
    expect(container.querySelectorAll('section.rounded-lg')).toHaveLength(2);
  });

  it('shows a clear empty state and allows changing the date then returning to yesterday', async () => {
    await renderPage();
    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(date, '2026-10-04');
      date.dispatchEvent(new Event('input', { bubbles: true }));
      date.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(fetchMock.mock.calls.some(([url]) => url === 'http://localhost:3000/api/produccion?fecha=2026-10-04')).toBe(true);
    fetchMock.mockImplementation(async () => json({ fecha: '2026-10-04', timezone: 'America/Mexico_City', tiendas: [], consolidado: [] }));
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['produccion', '2026-10-04'] }); });
    await flush();
    expect(container.textContent).toContain('No hay pedidos vigentes');
    await click('Ayer');
    expect(fetchMock.mock.calls.some(([url]) => url === 'http://localhost:3000/api/produccion')).toBe(true);
  });

  it('shows an error with a retry action', async () => {
    fetchMock.mockImplementationOnce(async () => json({ message: 'API no disponible' }, 503));
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('API no disponible');
    expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'Reintentar')).toBe(true);
  });

  it('uses server default date first and does not expose edit or administrative actions', async () => {
    await renderPage();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/api/produccion');
    expect(container.textContent).not.toContain('Sucursales');
    expect(container.textContent).not.toContain('Guardar');
    expect([...container.querySelectorAll('button')].map((button) => button.textContent?.trim())).toEqual(['Ayer']);
  });
});
