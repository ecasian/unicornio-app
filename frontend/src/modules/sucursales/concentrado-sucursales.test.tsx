// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCsrfMock } from '../../test-utils';
import { ConcentradoSucursalesPage } from './ConcentradoSucursalesPage';

const branch = { id: 1, nombre: 'Carranza', activo: true, createdAt: '', updatedAt: '' };
const flavor = { id: 7, nombre: 'Fresa' };
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let confirmedDate: string | null = null;
let savedDetails: { saborId: number; capacidadLitros: number; cantidad: number }[] = [];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const emptyReport = (fecha = '2026-11-17') => ({ fecha, timezone: 'America/Mexico_City', sucursalesSinConfirmar: [branch], sucursales: [], consolidado: [] });
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

async function renderPage(initialEntry = '/sucursales') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]}><LocationProbe /><ConcentradoSucursalesPage /></MemoryRouter></QueryClientProvider>); });
  for (let i = 0; i < 6; i++) await flush();
}

async function selectBranchAndAddNeed() {
  const branchSelect = container.querySelector('select') as HTMLSelectElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(branchSelect, '1');
    branchSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
  const flavorSelect = [...container.querySelectorAll('select')][1];
  const quantityInput = container.querySelector('input[type="number"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(flavorSelect, '7');
    flavorSelect.dispatchEvent(new Event('change', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(quantityInput, '3');
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
    quantityInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Agregar renglón'))!;
  await act(async () => { add.click(); });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  confirmedDate = null;
  savedDetails = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/sucursales')) return json([branch]);
    if (url.endsWith('/sucursales/sabores')) return json([flavor]);
    if (url.includes('/necesidades/confirmacion')) { confirmedDate = new URL(url, 'https://staging.test').searchParams.get('fecha'); return json({ estado: 'CONFIRMADO' }); }
    if (url.includes('/necesidades')) { savedDetails = JSON.parse(String(init?.body)).detalles; return json({ estado: 'BORRADOR' }); }
    if (url.includes('/concentrado-sucursales')) {
      const requestedDate = new URL(url, 'https://staging.test').searchParams.get('fecha') ?? '2026-11-17';
      return json(confirmedDate === requestedDate ? {
        fecha: requestedDate, timezone: 'America/Mexico_City', sucursalesSinConfirmar: [],
        sucursales: [{ sucursalId: branch.id, sucursal: branch.nombre, estado: 'CONFIRMADO', confirmadoAt: `${requestedDate}T12:00:00.000Z`, detalles: savedDetails.map((item) => ({ ...item, sabor: flavor.nombre, litrosEquivalentes: item.cantidad * item.capacidadLitros })) }],
        consolidado: savedDetails.map((item) => ({ ...item, sabor: flavor.nombre, litrosEquivalentes: item.cantidad * item.capacidadLitros })),
      } : emptyReport(requestedDate));
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', withCsrfMock(fetchMock));
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
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati' }).format(new Date())).not.toBe('2026-11-17');
    await renderPage();
    expect(container.querySelector('input[type="date"]')).toHaveProperty('value', '2026-11-17');
    expect(fetchMock.mock.calls.some(([url]) => new URL(String(url), 'https://staging.test').pathname.endsWith('/concentrado-sucursales') && !new URL(String(url), 'https://staging.test').searchParams.has('fecha'))).toBe(true);
  });

  it('shows API errors and a no-report empty state', async () => {
    fetchMock.mockRejectedValueOnce(new Error('API sin conexión'));
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('API sin conexión');

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/sucursales')) return json([]);
      if (url.endsWith('/sucursales/sabores')) return json([]);
      return json({ fecha: '2026-11-17', sucursalesSinConfirmar: [], sucursales: [], consolidado: [] });
    });
    await act(async () => { root.unmount(); root = createRoot(container); });
    await renderPage();
    expect(container.textContent).toContain('Aún no hay reportes confirmados');
    expect(container.textContent).toContain('Todas las sucursales registradas tienen reporte confirmado');
  });

  it('confirms the automatic operational date and preserves the matching detail after reload', async () => {
    await renderPage();
    await selectBranchAndAddNeed();
    const submit = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Guardar y confirmar'))!;
    await act(async () => { submit.click(); });
    for (let i = 0; i < 8; i++) await flush();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/sucursales/1/necesidades') && init?.method === 'PUT')).toBe(true);
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/necesidades/confirmacion') && init?.method === 'POST')).toBe(true);
    expect(container.textContent).toContain('El reporte de Carranza quedó confirmado para la fecha operativa del 17/11/2026.');
    const detailLink = [...container.querySelectorAll('a')].find((link) => link.textContent === 'Ver detalle del reporte')!;
    const detailUrl = new URL(detailLink.getAttribute('href')!, 'https://staging.test');
    expect(detailUrl.searchParams.get('fecha')).toBe('2026-11-17');
    expect(detailUrl.searchParams.get('sucursalId')).toBe('1');
    expect(detailUrl.hash).toBe('#reporte-sucursal-1');
    expect(container.querySelector('#reporte-sucursal-1')?.textContent).toContain('Fresa');
    const detail = container.querySelector('#reporte-sucursal-1')!;
    const scrollIntoView = vi.fn();
    Object.defineProperty(detail, 'scrollIntoView', { value: scrollIntoView });
    await act(async () => { detailLink.click(); });
    await flush();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(document.activeElement).toBe(detail);
    expect(container.querySelector('input[type="date"]')).toHaveProperty('value', '2026-11-17');
    const locationAfterConfirm = new URL(container.querySelector('[data-testid="location"]')?.textContent ?? '', 'https://staging.test');
    expect(locationAfterConfirm.searchParams.get('fecha')).toBe('2026-11-17');
    expect(locationAfterConfirm.searchParams.get('sucursalId')).toBe('1');
    await act(async () => { root.unmount(); root = createRoot(container); });
    await renderPage('/sucursales?fecha=2026-11-17&sucursalId=1#reporte-sucursal-1');
    expect(fetchMock.mock.calls.some(([url]) => new URL(String(url), 'https://staging.test').searchParams.get('fecha') === '2026-11-17')).toBe(true);
    expect(container.textContent).toContain('El reporte de Carranza quedó confirmado para la fecha operativa del 17/11/2026.');
    expect(container.querySelector('#reporte-sucursal-1')?.textContent).toContain('Fresa');
    expect(document.activeElement).toBe(container.querySelector('#reporte-sucursal-1'));
  });

  it('confirms a manually selected date and preserves it with the same detail after reload', async () => {
    await renderPage();
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(dateInput, '2026-11-24');
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await selectBranchAndAddNeed();
    const submit = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Guardar y confirmar'))!;
    await act(async () => { submit.click(); });
    for (let i = 0; i < 8; i++) await flush();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/necesidades') && init?.method === 'PUT' && JSON.parse(String(init.body)).fecha === '2026-11-24')).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => new URL(String(url), 'https://staging.test').pathname.includes('/necesidades/confirmacion') && new URL(String(url), 'https://staging.test').searchParams.get('fecha') === '2026-11-24')).toBe(true);
    expect(container.textContent).toContain('El reporte de Carranza quedó confirmado para la fecha operativa del 24/11/2026.');
    const detailLink = [...container.querySelectorAll('a')].find((link) => link.textContent === 'Ver detalle del reporte')!;
    const detailUrl = new URL(detailLink.getAttribute('href')!, 'https://staging.test');
    expect(detailUrl.searchParams.get('fecha')).toBe('2026-11-24');
    expect(detailUrl.searchParams.get('sucursalId')).toBe('1');
    expect(detailUrl.hash).toBe('#reporte-sucursal-1');
    const detail = container.querySelector('#reporte-sucursal-1')!;
    const scrollIntoView = vi.fn();
    Object.defineProperty(detail, 'scrollIntoView', { value: scrollIntoView });
    await act(async () => { detailLink.click(); });
    await flush();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(document.activeElement).toBe(detail);
    const locationAfterConfirm = new URL(container.querySelector('[data-testid="location"]')?.textContent ?? '', 'https://staging.test');
    expect(locationAfterConfirm.searchParams.get('fecha')).toBe('2026-11-24');
    expect(locationAfterConfirm.searchParams.get('sucursalId')).toBe('1');
    await act(async () => { root.unmount(); root = createRoot(container); });
    await renderPage('/sucursales?fecha=2026-11-24&sucursalId=1#reporte-sucursal-1');
    expect(container.querySelector('input[type="date"]')).toHaveProperty('value', '2026-11-24');
    expect(container.textContent).toContain('El reporte de Carranza quedó confirmado para la fecha operativa del 24/11/2026.');
    expect(container.querySelector('#reporte-sucursal-1')?.textContent).toContain('Fresa');
    expect(document.activeElement).toBe(container.querySelector('#reporte-sucursal-1'));
  });
});
