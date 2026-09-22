// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Presentacion, PresentacionState, Sabor } from '../../shared/api/catalogo';
import { SaboresPage } from './SaboresPage';

const initial: Sabor = { id: 1, nombre: 'Fresa', activo: true, createdAt: '', updatedAt: '' };
const presentaciones: Presentacion[] = [
  { id: 1, nombre: '1 litro', litrosEquivalentes: 1, createdAt: '', updatedAt: '' },
  { id: 2, nombre: '1/2 litro', litrosEquivalentes: 0.5, createdAt: '', updatedAt: '' },
];
let container: HTMLDivElement;
let root: Root;
let rows: Sabor[];
let states: PresentacionState[];
let listCalls: number;
let configCalls: number;
let failList: boolean;
let fetchMock: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((node) => node.textContent?.trim() === name);
  if (!found) throw new Error(`No se encontró el botón ${name}`);
  return found;
}

function nameInput(): HTMLInputElement {
  const found = container.querySelector('form input:not([type="checkbox"])');
  if (!(found instanceof HTMLInputElement)) throw new Error('No se encontró el nombre');
  return found;
}

function checkbox(label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('form label')].find((node) => node.textContent?.trim() === label)?.querySelector('input');
  if (!(found instanceof HTMLInputElement)) throw new Error(`No se encontró la presentación ${label}`);
  return found;
}

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function click(name: string) {
  await act(async () => { button(name).click(); });
  await flush();
}

async function fillName(value: string) {
  await act(async () => {
    const field = nameInput();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function renderPage() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={queryClient}><MemoryRouter><SaboresPage /></MemoryRouter></QueryClientProvider>);
  });
  await flush();
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  rows = [];
  states = [{ presentacionId: 1, habilitada: false }, { presentacionId: 2, habilitada: false }];
  listCalls = 0;
  configCalls = 0;
  failList = false;
  fetchMock = vi.fn(async (resource: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (resource.endsWith('/presentaciones') && !resource.includes('/sabores/') && method === 'GET') return json(presentaciones);
    if (resource.endsWith('/sabores') && method === 'GET') {
      listCalls += 1;
      return failList ? json({ message: 'Sin conexión' }, 503) : json(rows);
    }
    if (resource.endsWith('/sabores') && method === 'POST') {
      const data = JSON.parse(init?.body as string) as { nombre: string };
      const created = { ...initial, ...data, id: rows.length + 1, activo: true };
      rows = [...rows, created];
      return json(created, 201);
    }
    if (resource.endsWith('/presentaciones') && resource.includes('/sabores/') && method === 'GET') {
      configCalls += 1;
      return json(presentaciones.map((item) => ({ presentacionId: item.id, nombre: item.nombre, litrosEquivalentes: item.litrosEquivalentes, habilitada: states.find((state) => state.presentacionId === item.id)?.habilitada ?? false })));
    }
    if (resource.endsWith('/presentaciones') && method === 'PUT') {
      states = (JSON.parse(init?.body as string) as { presentaciones: PresentacionState[] }).presentaciones;
      return json(states);
    }
    if (method === 'PATCH') {
      const id = Number(resource.split('/').at(-1));
      const data = JSON.parse(init?.body as string) as Partial<Sabor>;
      rows = rows.map((row) => row.id === id ? { ...row, ...data } : row);
      return json(rows.find((row) => row.id === id));
    }
    return json({ message: 'No encontrado' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('SaboresPage', () => {
  it('shows loading while the list is pending', async () => {
    let resolveList!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveList = resolve; }));
    await renderPage();
    expect(container.textContent).toContain('Cargando catálogo');
    await act(async () => { resolveList(json([])); });
    await flush();
    expect(container.textContent).toContain('Todavía no hay sabores');
  });

  it('renders the list, global presentations and shared navigation', async () => {
    rows = [initial];
    await renderPage();
    expect(container.textContent).toContain('Fresa');
    expect(container.textContent).toContain('1 litro y 1/2 litro');
    expect(button('Sucursales · Próximamente').disabled).toBe(true);
    expect(container.querySelector('nav')?.textContent).toContain('Clientes');
    expect(container.querySelector('nav')?.textContent).toContain('Repartidores');
    expect(listCalls).toBe(1);
  });

  it('renders an empty state', async () => {
    await renderPage();
    expect(container.textContent).toContain('Todavía no hay sabores');
  });

  it('shows an error and retries the list', async () => {
    failList = true;
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Sin conexión');
    failList = false;
    await click('Reintentar');
    expect(container.textContent).toContain('Todavía no hay sabores');
  });

  it('creates a flavor and refetches the list', async () => {
    await renderPage();
    await click('Nuevo sabor');
    expect(document.activeElement).toBe(nameInput());
    await fillName('Fresa');
    await click('Guardar sabor');
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ nombre: 'Fresa' });
    expect(listCalls).toBe(2);
    expect(container.textContent).toContain('Sabor creado.');
    expect(container.textContent).toContain('Fresa');
  });

  it('edits only the name and toggles active state separately', async () => {
    rows = [initial];
    await renderPage();
    await click('Editar');
    await fillName('Nuez');
    await click('Guardar sabor');
    const firstPatch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(firstPatch?.[1]?.body as string)).toEqual({ nombre: 'Nuez' });
    expect(container.textContent).toContain('Nuez');
    await click('Desactivar');
    expect(rows[0].activo).toBe(false);
    expect(container.textContent).toContain('Inactivo');
    await click('Activar');
    expect(rows[0].activo).toBe(true);
    expect(listCalls).toBe(4);
    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patches.slice(1).map(([, init]) => JSON.parse(init?.body as string))).toEqual([{ activo: false }, { activo: true }]);
  });

  it('saves both presentation states and refetches their persisted values', async () => {
    rows = [initial];
    await renderPage();
    await click('Configurar presentaciones');
    expect(document.activeElement).toBe(checkbox('1 litro'));
    expect(checkbox('1 litro').checked).toBe(false);
    expect(checkbox('1/2 litro').checked).toBe(false);
    await act(async () => { checkbox('1 litro').click(); });
    await act(async () => { checkbox('1/2 litro').click(); });
    await click('Guardar presentaciones');
    const puts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(puts[0]?.[0]).toBe('http://localhost:3000/api/sabores/1/presentaciones');
    expect(JSON.parse(puts[0]?.[1]?.body as string)).toEqual({ presentaciones: [
      { presentacionId: 1, habilitada: true }, { presentacionId: 2, habilitada: true },
    ] });
    expect(configCalls).toBeGreaterThanOrEqual(2);
    await click('Configurar presentaciones');
    expect(checkbox('1 litro').checked).toBe(true);
    expect(checkbox('1/2 litro').checked).toBe(true);
    await act(async () => { checkbox('1 litro').click(); });
    await click('Guardar presentaciones');
    expect(JSON.parse(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')[1]?.[1]?.body as string)).toEqual({ presentaciones: [
      { presentacionId: 1, habilitada: false }, { presentacionId: 2, habilitada: true },
    ] });
    await click('Configurar presentaciones');
    expect(checkbox('1 litro').checked).toBe(false);
    expect(checkbox('1/2 litro').checked).toBe(true);
  });

  it('updates open checkboxes when TanStack Query receives a changed remote state', async () => {
    rows = [initial];
    await renderPage();
    await click('Configurar presentaciones');
    await act(async () => { checkbox('1 litro').click(); });
    states = [{ presentacionId: 1, habilitada: false }, { presentacionId: 2, habilitada: true }];
    await act(async () => {
      queryClient.setQueryData(['sabores', 1, 'presentaciones'], presentaciones.map((item) => ({
        presentacionId: item.id,
        nombre: item.nombre,
        litrosEquivalentes: item.litrosEquivalentes,
        habilitada: states.find((state) => state.presentacionId === item.id)?.habilitada ?? false,
      })));
    });
    await flush();
    expect(checkbox('1 litro').checked).toBe(false);
    expect(checkbox('1/2 litro').checked).toBe(true);
    await act(async () => { checkbox('1 litro').click(); });
    await act(async () => { checkbox('1/2 litro').click(); });
    await click('Guardar presentaciones');
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(put?.[1]?.body as string)).toEqual({ presentaciones: [
      { presentacionId: 1, habilitada: true }, { presentacionId: 2, habilitada: false },
    ] });
    await click('Configurar presentaciones');
    expect(checkbox('1 litro').checked).toBe(true);
    expect(checkbox('1/2 litro').checked).toBe(false);
  });
});
