// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCsrfMock } from '../../test-utils';
import { AdminUsersPage } from './AdminUsersPage';
import { AuditPage } from './AuditPage';

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let created: Array<{ url: string; method: string; body: unknown }>;
let listedUsers: unknown[];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  created = [];
  listedUsers = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) as unknown : undefined;
    if (method !== 'GET') created.push({ url, method, body });
    if (url === '/api/auth/users' && method === 'GET') return json(listedUsers);
    if (url === '/api/repartidores') return json([{ id: 5, nombre: 'Fer Demo', activo: false }]);
    if (url === '/api/repartidores?activo=true') return json([{ id: 5, nombre: 'Fer Demo', activo: true }]);
    if (url === '/api/auth/roles') return json([
      { codigo: 'ADMIN_GENERAL', nombre: 'Administrador general' },
      { codigo: 'ADMIN_SUCURSALES', nombre: 'Administrador de sucursales' },
      { codigo: 'REPARTIDOR', nombre: 'Repartidor' },
      { codigo: 'OPERADOR_PRODUCCION', nombre: 'Operador de producción' },
    ]);
    if (url === '/api/auth/users' && method === 'POST') return json({ id: 12, nombre: 'Fer', username: 'fer', activo: true, repartidorId: null }, 201);
    if (url === '/api/auth/audit') return json([{
      id: '9007199254740993', actorUsuarioId: null, accion: 'MUTATION_REQUESTED', ruta: '/api/clientes',
      metodo: 'POST', resultado: 'REQUESTED', requestId: 'req-1', metadata: {}, createdAt: '2026-11-12T18:00:00.000Z', actor: null,
    }]);
    return json({ ok: true });
  });
  vi.stubGlobal('fetch', withCsrfMock(fetchMock));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => root.render(<QueryClientProvider client={client}>{element}</QueryClientProvider>));
  await flush();
  await flush();
}

async function renderWithCourierRead(element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const user = { id: 1, username: 'admin', nombre: 'Admin', repartidorId: null,
    roles: ['ADMIN_GENERAL'], permissions: ['usuarios:manage', 'repartidores:read'] };
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/']}>
    <Routes><Route element={<Outlet context={user} />}><Route path="/" element={element} /></Route></Routes>
  </MemoryRouter></QueryClientProvider>));
  await flush(); await flush();
}

describe('administración de acceso', () => {
  it('crea una cuenta con rol seleccionado y muestra resultado', async () => {
    await render(<AdminUsersPage />);
    const inputs = [...container.querySelectorAll<HTMLInputElement>('form input')];
    const setInput = async (input: HTMLInputElement, value: string) => act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await setInput(inputs[0], 'Fer');
    await setInput(inputs[1], 'fer');
    await setInput(inputs[2], 'secure-test-password');
    const role = container.querySelector('input[aria-label="Crear Administrador general"]') as HTMLInputElement;
    await act(async () => role.click());
    await flush();
    const form = container.querySelector('form')!;
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush(); await flush();
    expect(created).toContainEqual({
      url: '/api/auth/users', method: 'POST',
      body: { nombre: 'Fer', username: 'fer', password: 'secure-test-password', roles: ['ADMIN_GENERAL'] },
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Usuario creado.');
  });

  it('no preselecciona roles y solo ofrece repartidores activos al asignar ese rol', async () => {
    await render(<AdminUsersPage />);
    const role = container.querySelector('input[aria-label="Crear Repartidor"]') as HTMLInputElement;
    expect(role.checked).toBe(false);
    expect(container.querySelector('select')).toBeNull();
    await act(async () => role.click());
    await flush();
    const select = container.querySelector('select') as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(['Selecciona un Repartidor activo', 'Fer Demo']);
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(select, '5');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const inputs = [...container.querySelectorAll<HTMLInputElement>('form input')];
    const setInput = async (input: HTMLInputElement, value: string) => act(async () => {
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      inputSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await setInput(inputs[0], 'Repartidora Demo');
    await setInput(inputs[1], 'repartidora');
    await setInput(inputs[2], 'secure-test-password');
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush(); await flush();
    expect(created).toContainEqual(expect.objectContaining({
      url: '/api/auth/users', method: 'POST',
      body: { nombre: 'Repartidora Demo', username: 'repartidora', password: 'secure-test-password', roles: ['REPARTIDOR'], repartidorId: 5 },
    }));
  });

  it('distingue la cuenta de la ficha vinculada y conserva su estado inactivo', async () => {
    listedUsers = [{ id: 9, nombre: 'Usuario vinculado', username: 'linked', activo: true, repartidorId: 5,
      roles: [{ rol: { codigo: 'REPARTIDOR', nombre: 'Repartidor' } }] }];
    await renderWithCourierRead(<AdminUsersPage />);
    expect(container.textContent).toContain('Cuentas y permisos');
    expect(container.textContent).toContain('Ficha vinculada: Fer Demo · Inactiva');
    expect(container.textContent).toContain('La cuenta inicia sesión; la ficha identifica al repartidor');
  });

  it('muestra auditoría histórica sin atribuir actor ficticio', async () => {
    await render(<AuditPage />);
    expect(container.textContent).toContain('MUTATION_REQUESTED');
    expect(container.textContent).toContain('Sin actor autenticado');
    expect(container.textContent).toContain('POST /api/clientes');
  });
});
