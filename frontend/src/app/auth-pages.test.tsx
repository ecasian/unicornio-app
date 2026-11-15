// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../shared/api/auth';

const api = vi.hoisted(() => ({ session: vi.fn(), logout: vi.fn(), login: vi.fn() }));
vi.mock('../shared/api/auth', () => ({ authApi: api }));
import { AuthenticatedLayout, HomePage, LoginPage } from './AuthPages';

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const user: AuthUser = {
  id: 4,
  email: 'fer@example.invalid',
  nombre: 'Fer',
  repartidorId: null,
  roles: ['ADMIN_SUCURSALES'],
  permissions: ['auth:session', 'inventario-sucursales:manage', 'inventario-sucursales:read', 'sucursales:manage'],
};
const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

async function renderRoute(path: string) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthenticatedLayout />}>
      <Route path="/inventario-sucursales" element={<p>Captura disponible</p>} />
      <Route path="/sucursales/stock-objetivo" element={<p>Objetivos disponible</p>} />
      <Route path="/admin/usuarios" element={<p>Usuarios disponible</p>} />
      <Route path="/" element={<HomePage />} />
      </Route>
    </Routes>
  </MemoryRouter></QueryClientProvider>));
  for (let index = 0; index < 5; index++) await flush();
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  api.session.mockResolvedValue(user);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('rutas autenticadas', () => {
  it('muestra módulos permitidos y permite desplegar el menú móvil', async () => {
    await renderRoute('/inventario-sucursales');
    expect(container.textContent).toContain('Captura disponible');
    const menu = container.querySelector('button[aria-controls="main-navigation"]') as HTMLButtonElement;
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    await act(async () => menu.click());
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('a[href="/inventario-sucursales"]')?.textContent).toContain('Inventario por turno');
    expect(container.querySelector('a[href="/admin/usuarios"]')).toBeNull();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
  });

  it('marca una sola ruta activa y mantiene la ruta profunda en navegación', async () => {
    await renderRoute('/sucursales/stock-objetivo');
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
    expect(container.querySelector('a[href="/sucursales/stock-objetivo"]')?.getAttribute('aria-current')).toBe('page');
  });

  it('muestra al usuario activo y sus procesos disponibles en Inicio', async () => {
    await renderRoute('/');
    expect(container.textContent).toContain('Fer');
    expect(container.textContent).toContain('Estos son los procesos disponibles para tu cuenta.');
    expect(container.querySelectorAll('a[href="/inventario-sucursales"]')).toHaveLength(2);
  });

  it('blocks a deep route when the session lacks its required permission', async () => {
    await renderRoute('/admin/usuarios');
    expect(container.textContent).toContain('Acceso no autorizado');
    expect(container.textContent).not.toContain('Usuarios disponible');
  });

  it('does not expose the editable objectives page to a read-only role', async () => {
    api.session.mockResolvedValue({ ...user, permissions: ['auth:session', 'sucursales:read'] });
    await renderRoute('/sucursales/stock-objetivo');
    expect(container.textContent).toContain('Acceso no autorizado');
    expect(container.querySelector('a[href="/sucursales/stock-objetivo"]')).toBeNull();
  });
});

describe('inicio de sesión', () => {
  it('alterna visibilidad sin borrar el valor ni enviar el formulario', async () => {
    api.session.mockRejectedValue(new Error('Sin sesión'));
    await renderRoute('/login');
    const password = container.querySelector<HTMLInputElement>('#password')!;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      valueSetter.call(password, 'demo-password');
      password.dispatchEvent(new Event('input', { bubbles: true }));
    });
    password.focus();
    const show = container.querySelector<HTMLButtonElement>('button[aria-label="Mostrar contraseña"]')!;
    expect(show.type).toBe('button');
    await act(async () => show.click());
    expect(password.type).toBe('text');
    expect(password.value).toBe('demo-password');
    expect(document.activeElement).toBe(password);
    expect(container.querySelector('button[type="submit"]')).toBeTruthy();
    expect(api.login).not.toHaveBeenCalled();
    const hide = container.querySelector<HTMLButtonElement>('button[aria-label="Ocultar contraseña"]')!;
    await act(async () => hide.click());
    expect(password.type).toBe('password');
    expect(password.value).toBe('demo-password');
    expect(api.login).not.toHaveBeenCalled();
  });
});
