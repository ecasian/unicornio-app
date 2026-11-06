// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConcentradoSucursalesPage } from './ConcentradoSucursalesPage';

const branch = { id: 1, nombre: 'Sucursal de prueba', activo: true, createdAt: '', updatedAt: '' };
const flavor = { id: 7, nombre: 'Sabor de prueba' };
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let confirmed = false;
let savedDetails: { saborId: number; capacidadLitros: number; cantidad: number }[] = [];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const emptyReport = () => ({ fecha: '2026-11-04', timezone: 'America/Mexico_City', sucursalesSinConfirmar: [branch], sucursales: [], consolidado: [] });
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter><ConcentradoSucursalesPage /></MemoryRouter></QueryClientProvider>); });
  for (let i = 0; i < 6; i++) await flush();
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  confirmed = false;
  savedDetails = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/sucursales')) return json([branch]);
    if (url.endsWith('/sucursales/sabores')) return json([flavor]);
    if (url.includes('/necesidades/confirmacion')) { confirmed = true; return json({ estado: 'CONFIRMADO' }); }
    if (url.includes('/necesidades')) { savedDetails = JSON.parse(String(init?.body)).detalles; return json({ estado: 'BORRADOR' }); }
    if (url.includes('/concentrado-sucursales')) {
      return json(confirmed ? {
        fecha: '2026-11-04', sucursalesSinConfirmar: [],
        sucursales: [{ sucursalId: branch.id, sucursal: branch.nombre, estado: 'CONFIRMADO', confirmadoAt: '2026-11-04T12:00:00.000Z', detalles: savedDetails.map((item) => ({ ...item, sabor: flavor.nombre, litrosEquivalentes: item.cantidad * item.capacidadLitros })) }],
        consolidado: savedDetails.map((item) => ({ ...item, sabor: flavor.nombre, litrosEquivalentes: item.cantidad * item.capacidadLitros })),
      } : emptyReport());
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});

afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('ConcentradoSucursalesPage', () => {
  it('shows loading while the API is pending', async () => {
    let release!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter><ConcentradoSucursalesPage /></MemoryRouter></QueryClientProvider>); });
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Cargando concentrado');
    await act(async () => { release(json([branch])); });
  });

  it('uses the backend operational date when the browser has another timezone', async () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati');
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Pacific/Kiritimati');
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati' }).format(new Date())).not.toBe('2026-11-04');
    await renderPage();
    expect(container.querySelector('input[type="date"]')).toHaveProperty('value', '2026-11-04');
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/concentrado-sucursales'))).toBe(true);
  });

  it('shows API errors and a no-report empty state', async () => {
    fetchMock.mockRejectedValueOnce(new Error('API sin conexión'));
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('API sin conexión');

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/sucursales')) return json([]);
      if (url.endsWith('/sucursales/sabores')) return json([]);
      return json({ fecha: '2026-11-04', sucursalesSinConfirmar: [], sucursales: [], consolidado: [] });
    });
    await act(async () => { root.unmount(); root = createRoot(container); });
    await renderPage();
    expect(container.textContent).toContain('Aún no hay reportes confirmados');
    expect(container.textContent).toContain('Todas las sucursales registradas tienen reporte confirmado');
  });

  it('takes Fer through save and confirmation, then shows Jonathan the detail and consolidation', async () => {
    await renderPage();
    const selects = [...container.querySelectorAll('select')];
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(selects[0], '1');
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    const updatedSelects = [...container.querySelectorAll('select')];
    const flavorSelect = updatedSelects[1];
    const capacitySelect = updatedSelects[2];
    const quantityInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(flavorSelect, '7');
      flavorSelect.dispatchEvent(new Event('change', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(capacitySelect, '6');
      capacitySelect.dispatchEvent(new Event('change', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(quantityInput, '3');
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
      quantityInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Agregar renglón'))!;
    await act(async () => { add.click(); });
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(dateInput, '2099-12-30');
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).not.toContain('3 cubetas · 18 L');
    const addAgain = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Agregar renglón'))!;
    await act(async () => { addAgain.click(); });
    const submit = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Guardar y confirmar'))!;
    await act(async () => { submit.click(); });
    for (let i = 0; i < 8; i++) await flush();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/sucursales/1/necesidades') && init?.method === 'PUT')).toBe(true);
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/necesidades/confirmacion') && init?.method === 'POST')).toBe(true);
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/necesidades') && init?.method === 'PUT' && JSON.parse(String(init.body)).fecha === '2099-12-30')).toBe(true);
    expect(container.textContent).toContain('Reporte confirmado');
    expect(container.textContent).toContain('Detalle por sucursal');
    expect(container.textContent).toContain('Consolidado general');
    expect(container.textContent).toContain('18 L');
  });
});
