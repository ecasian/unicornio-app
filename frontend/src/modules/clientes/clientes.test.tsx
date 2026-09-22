// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cliente } from '../../shared/api/clientes';
import { ClientesPage } from './ClientesPage';

const initial: Cliente = {
  id: 1, nombre: 'Punto Fresco', celular: '3121234567', direccion: 'Av. Ejemplo 123',
  manejaMedioLitro: false, activo: true, createdAt: '', updatedAt: '',
};

let container: HTMLDivElement;
let root: Root;
let rows: Cliente[];
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

function input(label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('label')].find((node) => node.textContent?.trim() === label)?.querySelector('input');
  if (!found) throw new Error(`No se encontró el campo ${label}`);
  return found;
}

async function click(name: string): Promise<void> {
  await act(async () => { button(name).click(); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function fill(label: string, value: string): Promise<void> {
  await act(async () => {
    const field = input(label);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function renderPage(): Promise<void> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={queryClient}><MemoryRouter><ClientesPage /></MemoryRouter></QueryClientProvider>);
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
    if (resource.endsWith('/clientes') && method === 'GET') {
      listCalls += 1;
      return failList ? json({ message: 'Sin conexión' }, 503) : json(rows);
    }
    if (resource.endsWith('/clientes') && method === 'POST') {
      const data = JSON.parse(init?.body as string) as Pick<Cliente, 'nombre' | 'celular' | 'direccion' | 'manejaMedioLitro'>;
      const created = { ...initial, ...data, id: rows.length + 1, activo: true };
      rows = [...rows, created];
      return json(created, 201);
    }
    const id = Number(resource.split('/').at(-1));
    if (method === 'PATCH') {
      const data = JSON.parse(init?.body as string) as Partial<Cliente>;
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

describe('ClientesPage', () => {
  it('renders the fetched list', async () => {
    rows = [initial];
    await renderPage();
    expect(container.textContent).toContain('Punto Fresco');
    expect(container.textContent).toContain('3121234567');
    expect(container.textContent).toContain('Activo');
    expect(listCalls).toBe(1);
  });

  it('renders the empty state', async () => {
    await renderPage();
    expect(container.textContent).toContain('Todavía no hay clientes');
  });

  it('shows an API error with a retry action', async () => {
    failList = true;
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Sin conexión');
    failList = false;
    await click('Reintentar');
    expect(container.textContent).toContain('Todavía no hay clientes');
  });

  it('opens, fills and submits the creation form, then refetches the list', async () => {
    await renderPage();
    await click('Nuevo cliente');
    expect(container.textContent).toContain('Nuevo cliente');
    expect(document.activeElement).toBe(input('Nombre'));
    await fill('Nombre', 'Punto Fresco');
    await fill('Celular', '3121234567');
    await fill('Dirección', 'Av. Ejemplo 123');
    await act(async () => { input('Maneja presentación de 1/2 litro').click(); });
    expect(input('Maneja presentación de 1/2 litro').checked).toBe(true);
    await click('Guardar cliente');
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      nombre: 'Punto Fresco', celular: '3121234567', direccion: 'Av. Ejemplo 123', manejaMedioLitro: true,
    });
    expect(listCalls).toBe(2);
    expect(container.textContent).toContain('Cliente creado.');
    expect(container.textContent).toContain('Punto Fresco');
    expect(container.textContent).toContain('1/2 litroSí');
  });

  it('edits without sending activo, then deactivates and reactivates from the list', async () => {
    rows = [initial];
    await renderPage();
    await click('Editar');
    expect(input('Nombre').value).toBe('Punto Fresco');
    expect(container.querySelector('form')?.textContent).not.toContain('Activo');
    await fill('Nombre', 'Punto Nuevo');
    await click('Guardar cliente');
    const firstPatch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(firstPatch?.[1]?.body as string)).toMatchObject({ nombre: 'Punto Nuevo' });
    expect(JSON.parse(firstPatch?.[1]?.body as string)).not.toHaveProperty('activo');
    expect(container.textContent).toContain('Punto Nuevo');
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
