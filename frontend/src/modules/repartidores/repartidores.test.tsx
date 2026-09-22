// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repartidor } from '../../shared/api/repartidores';
import { RepartidoresPage } from './RepartidoresPage';

const initial: Repartidor = { id: 1, nombre: 'María López', activo: true, createdAt: '', updatedAt: '' };
let container: HTMLDivElement;
let root: Root;
let rows: Repartidor[];
let listCalls: number;
let failList: boolean;
let fetchMock: ReturnType<typeof vi.fn>;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((node) => node.textContent?.trim() === name);
  if (!found) throw new Error(`No se encontró el botón ${name}`);
  return found;
}

function nameInput(): HTMLInputElement {
  const found = container.querySelector('form input');
  if (!(found instanceof HTMLInputElement)) throw new Error('No se encontró el nombre');
  return found;
}

async function click(name: string) {
  await act(async () => { button(name).click(); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function fillName(value: string) {
  await act(async () => {
    const field = nameInput();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={queryClient}><MemoryRouter><RepartidoresPage /></MemoryRouter></QueryClientProvider>);
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  rows = [];
  listCalls = 0;
  failList = false;
  fetchMock = vi.fn(async (resource: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (resource.endsWith('/repartidores') && method === 'GET') {
      listCalls += 1;
      return failList ? json({ message: 'Sin conexión' }, 503) : json(rows);
    }
    if (resource.endsWith('/repartidores') && method === 'POST') {
      const data = JSON.parse(init?.body as string) as { nombre: string };
      const created = { ...initial, ...data, id: rows.length + 1, activo: true };
      rows = [...rows, created];
      return json(created, 201);
    }
    if (method === 'PATCH') {
      const id = Number(resource.split('/').at(-1));
      const data = JSON.parse(init?.body as string) as Partial<Repartidor>;
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

describe('RepartidoresPage', () => {
  it('shows loading while the list request is pending', async () => {
    let resolveList!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveList = resolve; }));
    await renderPage();
    expect(container.textContent).toContain('Cargando repartidores');
    await act(async () => { resolveList(json([])); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain('Todavía no hay repartidores');
  });

  it('renders the fetched list and disabled Sucursales button', async () => {
    rows = [initial];
    await renderPage();
    expect(container.textContent).toContain('María López');
    expect(container.textContent).toContain('Activo');
    expect(button('Sucursales · Próximamente').disabled).toBe(true);
    expect(listCalls).toBe(1);
  });

  it('renders an empty list', async () => {
    await renderPage();
    expect(container.textContent).toContain('Todavía no hay repartidores');
  });

  it('shows an error and retries', async () => {
    failList = true;
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Sin conexión');
    failList = false;
    await click('Reintentar');
    expect(container.textContent).toContain('Todavía no hay repartidores');
  });

  it('creates a repartidor and refetches the list', async () => {
    await renderPage();
    await click('Nuevo repartidor');
    expect(document.activeElement).toBe(nameInput());
    await fillName('María López');
    await click('Guardar repartidor');
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ nombre: 'María López' });
    expect(listCalls).toBe(2);
    expect(container.textContent).toContain('Repartidor creado.');
    expect(container.textContent).toContain('María López');
  });

  it('edits only the name, then deactivates and reactivates separately', async () => {
    rows = [initial];
    await renderPage();
    await click('Editar');
    expect(nameInput().value).toBe('María López');
    expect(container.querySelector('form')?.textContent).not.toContain('Activo');
    await fillName('María Pérez');
    await click('Guardar repartidor');
    const firstPatch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(firstPatch?.[1]?.body as string)).toEqual({ nombre: 'María Pérez' });
    expect(container.textContent).toContain('María Pérez');
    expect(listCalls).toBe(2);
    await click('Desactivar');
    expect(rows[0].activo).toBe(false);
    expect(container.textContent).toContain('Inactivo');
    await click('Activar');
    expect(rows[0].activo).toBe(true);
    expect(container.textContent).toContain('Activo');
    expect(listCalls).toBe(4);
    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patches.slice(1).map(([, init]) => JSON.parse(init?.body as string))).toEqual([{ activo: false }, { activo: true }]);
  });
});
