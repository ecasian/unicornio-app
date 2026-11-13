// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../shared/api/auth';

const api = vi.hoisted(() => ({ session: vi.fn(), logout: vi.fn() }));
vi.mock('../shared/api/auth', () => ({ authApi: api }));
import { AuthenticatedLayout } from './AuthPages';

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const user: AuthUser = {
  id: 4,
  email: 'fer@example.invalid',
  nombre: 'Fer',
  repartidorId: null,
  roles: ['ADMIN_SUCURSALES'],
  permissions: ['auth:session', 'inventario-sucursales:manage', 'inventario-sucursales:read'],
};
const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

async function renderRoute(path: string) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
    <Routes><Route element={<AuthenticatedLayout />}>
      <Route path="/inventario-sucursales" element={<p>Captura disponible</p>} />
      <Route path="/sucursales/stock-objetivo" element={<p>Objetivos disponible</p>} />
      <Route path="/admin/usuarios" element={<p>Usuarios disponible</p>} />
    </Route></Routes>
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
