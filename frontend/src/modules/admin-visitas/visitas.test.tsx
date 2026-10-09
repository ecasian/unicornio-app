// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisitasPage } from './VisitasPage';

const visits = {
  fecha: '2026-10-07',
  timezone: 'America/Mexico_City',
  filtros: { clienteId: null, repartidorId: null },
  visitas: [
    { id: 12, llegadaAt: '2026-10-07T23:00:00.000Z', cliente: { id: 2, nombre: 'Super ZNTE' }, repartidor: { id: 3, nombre: 'Beto' } },
    { id: 11, llegadaAt: '2026-10-07T18:00:00.000Z', cliente: { id: 2, nombre: 'Super ZNTE' }, repartidor: { id: 4, nombre: 'Ana' } },
  ],
};
const clients = [
  { id: 2, nombre: 'Super ZNTE', celular: '000', direccion: 'Centro', manejaMedioLitro: false, activo: true, createdAt: '', updatedAt: '' },
  { id: 8, nombre: 'Tienda Histórica', celular: '000', direccion: 'Norte', manejaMedioLitro: false, activo: false, createdAt: '', updatedAt: '' },
];
const drivers = [
  { id: 3, nombre: 'Beto', activo: true, createdAt: '', updatedAt: '' },
  { id: 4, nombre: 'Ana', activo: false, createdAt: '', updatedAt: '' },
];
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let visitsPayload: unknown;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/visitas']}><VisitasPage /></MemoryRouter></QueryClientProvider>); });
  for (let i = 0; i < 5; i++) await flush();
}

function dateInput() {
  const found = container.querySelector('input[type="date"]');
  if (!(found instanceof HTMLInputElement)) throw new Error('No se encontró el filtro de fecha');
  return found;
}

function selectFor(name: string) {
  const label = [...container.querySelectorAll('label')].find((node) => node.textContent?.trim().startsWith(name));
  const found = label?.querySelector('select');
  if (!(found instanceof HTMLSelectElement)) throw new Error(`No se encontró el selector ${name}`);
  return found;
}

async function changeDate(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(dateInput(), value);
    dateInput().dispatchEvent(new Event('input', { bubbles: true }));
    dateInput().dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

async function changeSelect(name: string, value: string) {
  await act(async () => {
    const field = selectFor(name);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  visitsPayload = visits;
  fetchMock = vi.fn(async (resource: string) => {
    if (resource.includes('/admin/visitas')) return json(visitsPayload);
    if (resource.endsWith('/clientes')) return json(clients);
    if (resource.endsWith('/repartidores')) return json(drivers);
    return json({ message: 'No encontrado' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('VisitasPage', () => {
  it('loads without a date, reflects the server date, and renders repeated visits in received order', async () => {
    await renderPage();
    expect(fetchMock.mock.calls.some(([url]) => url === 'http://localhost:3000/api/admin/visitas')).toBe(true);
    expect(dateInput().value).toBe('2026-10-07');
    expect(container.querySelector('nav[aria-label="Navegación de Administrador"]')?.textContent).toContain('Visitas');
    expect(container.querySelector('a[href="/admin/visitas"]')).toBeNull();
    expect(container.textContent).toContain('Visitas');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.querySelector('tbody tr')?.textContent).toContain('Beto');
    expect(container.querySelectorAll('tbody tr')[1].textContent).toContain('Ana');
    expect(container.querySelectorAll('tbody tr')[0].textContent).toContain('Super ZNTE');
    const formatted = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: visits.timezone }).format(new Date(visits.visitas[0].llegadaAt));
    expect(container.querySelector('tbody tr')?.textContent).toContain(formatted);
    expect(selectFor('Cliente').textContent).toContain('Tienda Histórica · Inactivo');
    expect(selectFor('Repartidor').textContent).toContain('Ana · Inactivo');
    expect([...container.querySelectorAll('button')].filter((button) => !button.disabled)).toHaveLength(0);
    expect([...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Sucursales'))?.disabled).toBe(true);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === undefined || init?.method === 'GET')).toBe(true);
  });

  it('shows loading while the visit query is pending', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    await act(async () => { root.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><VisitasPage /></MemoryRouter></QueryClientProvider>); });
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Cargando visitas');
    await act(async () => { resolve(json(visits)); });
    await flush();
    expect(container.textContent).toContain('Super ZNTE');
  });

  it('shows a clear empty state', async () => {
    visitsPayload = { ...visits, visitas: [] };
    await renderPage();
    expect(container.textContent).toContain('No hay visitas registradas para esta fecha con los filtros seleccionados.');
  });

  it('shows API errors and a retry action', async () => {
    fetchMock.mockImplementationOnce(async () => json({ message: 'API no disponible' }, 503));
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('API no disponible');
    expect([...container.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Reintentar')).toBe(true);
  });

  it('applies date, client and driver filters together without sorting the response locally', async () => {
    await renderPage();
    await changeDate('2026-10-05');
    await changeSelect('Cliente', '2');
    await changeSelect('Repartidor', '3');
    const requested = fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.includes('fecha=2026-10-05') && url.includes('clienteId=2') && url.includes('repartidorId=3'));
    expect(requested).toBe('http://localhost:3000/api/admin/visitas?fecha=2026-10-05&clienteId=2&repartidorId=3');
    expect(container.querySelector('tbody tr')?.textContent).toContain('Beto');
    expect(container.querySelectorAll('tbody tr')[1].textContent).toContain('Ana');
  });
});
