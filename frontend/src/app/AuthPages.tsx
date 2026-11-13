import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../shared/api/request';
import { authApi, type AuthUser } from '../shared/api/auth';

const navItems = [
  { group: 'Sucursales', label: 'Concentrado', to: '/sucursales', permission: 'sucursales:manage' },
  { group: 'Sucursales', label: 'Inventario por turno', to: '/inventario-sucursales', permission: 'inventario-sucursales:manage' },
  { group: 'Sucursales', label: 'Consulta de inventarios', to: '/inventario-sucursales/consulta', permission: 'inventario-sucursales:read' },
  { group: 'Sucursales', label: 'Objetivos', to: '/sucursales/stock-objetivo', permission: 'sucursales:manage' },
  { group: 'Sucursales', label: 'Propuestas', to: '/sucursales/propuesta-abastecimiento', permission: 'abastecimiento:manage' },
  { group: 'Reparto', label: 'Captura de reparto', to: '/repartidor', permission: 'reparto:operate' },
  { group: 'Administración', label: 'Clientes', to: '/admin/clientes', permission: 'clientes:manage' },
  { group: 'Producción', label: 'Pedidos a producción', to: '/produccion', permission: 'produccion:read' },
  { group: 'Producción', label: 'YogurtBase', to: '/produccion/base', permission: 'produccion:read' },
  { group: 'Producción', label: 'Abastecimiento aprobado', to: '/produccion/abastecimiento-sucursales', permission: 'abastecimiento:read' },
  { group: 'Administración', label: 'Usuarios y roles', to: '/admin/usuarios', permission: 'usuarios:manage' },
  { group: 'Administración', label: 'Auditoría', to: '/admin/auditoria', permission: 'auditoria:read' },
  { group: 'Administración', label: 'Repartidores', to: '/admin/repartidores', permission: 'repartidores:manage' },
  { group: 'Administración', label: 'Sabores', to: '/admin/sabores', permission: 'catalogo:manage' },
  { group: 'Administración', label: 'Visitas', to: '/admin/visitas', permission: 'visitas:read' },
] as const;

function LoadingSession() {
  return <main className="mx-auto max-w-5xl p-6" role="status">Comprobando sesión…</main>;
}

function SessionError({ error }: { error: Error }) {
  return <main className="mx-auto max-w-xl p-6" role="alert">
    <h1 className="text-xl font-semibold">No se pudo comprobar la sesión</h1>
    <p className="mt-2">{error.message}</p>
    <button className="mt-4 rounded bg-slate-900 px-4 py-2 text-white" onClick={() => window.location.reload()}>Reintentar</button>
  </main>;
}

export function AuthenticatedLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: authApi.session, retry: false, staleTime: 30_000 });
  useEffect(() => {
    const expire = () => {
      queryClient.clear();
      navigate('/login', { replace: true, state: { from: location } });
    };
    window.addEventListener('auth:expired', expire);
    return () => window.removeEventListener('auth:expired', expire);
  }, [location, navigate, queryClient]);
  const unauthorized = session.error instanceof ApiError && session.error.status === 401;
  if (session.isPending) return <LoadingSession />;
  if (unauthorized) return <Navigate to="/login" replace state={{ from: location }} />;
  if (session.error) return <SessionError error={session.error} />;
  if (!session.data) return <Navigate to="/login" replace state={{ from: location }} />;
  const requiredPermission = routePermission(location.pathname);
  if (requiredPermission && !session.data.permissions.includes(requiredPermission)) return <AccessDenied />;
  return <AppShell user={session.data}><Outlet /></AppShell>;
}

function routePermission(path: string): string | undefined {
  if (path === '/repartidor') return 'reparto:operate';
  if (path === '/produccion' || path === '/produccion/base') return 'produccion:read';
  if (path === '/produccion/abastecimiento-sucursales') return 'abastecimiento:read';
  if (path === '/sucursales') return 'sucursales:manage';
  if (path === '/sucursales/stock-objetivo') return 'sucursales:manage';
  if (path === '/sucursales/propuesta-abastecimiento') return 'abastecimiento:manage';
  if (path === '/inventario-sucursales') return 'inventario-sucursales:manage';
  if (path === '/inventario-sucursales/consulta') return 'inventario-sucursales:read';
  if (path === '/admin/clientes') return 'clientes:manage';
  if (path.startsWith('/admin/clientes/')) return 'stock-cliente:manage';
  if (path === '/admin/repartidores') return 'repartidores:manage';
  if (path === '/admin/sabores') return 'catalogo:manage';
  if (path === '/admin/visitas') return 'visitas:read';
  if (path === '/admin/usuarios') return 'usuarios:manage';
  if (path === '/admin/auditoria') return 'auditoria:read';
  return undefined;
}

function AccessDenied() {
  return <main className="mx-auto max-w-xl rounded-lg border bg-white p-6" role="alert">
    <h1 className="text-xl font-semibold">Acceso no autorizado</h1>
    <p className="mt-2 text-slate-600">Tu cuenta no tiene permiso para abrir este módulo.</p>
  </main>;
}

function AppShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });
  const groups = ['Sucursales', 'Reparto', 'Producción', 'Administración'] as const;
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="bg-slate-900 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="text-lg font-bold">Unicornio</Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm sm:inline">{user.nombre}</span>
          <button className="rounded border border-slate-500 px-3 py-2 text-sm md:hidden" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? 'Cerrar menú' : 'Menú'}
          </button>
          <button className="rounded bg-white/10 px-3 py-2 text-sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
            {logout.isPending ? 'Saliendo…' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
      <nav id="main-navigation" aria-label="Navegación principal" className={`${menuOpen ? 'block' : 'hidden'} border-t border-white/15 px-4 py-3 md:block`}>
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:flex-wrap">
          <Link to="/" className="rounded px-2 py-1 text-sm hover:bg-white/10" onClick={() => setMenuOpen(false)}>Inicio</Link>
          {groups.map((group) => {
            const visible = navItems.filter((item) => item.group === group && user.permissions.includes(item.permission));
            return visible.length ? <section key={group} aria-label={group} className="flex flex-col gap-1 md:flex-row md:items-center">
              <span className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-300">{group}</span>
              {visible.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `rounded px-2 py-1 text-sm hover:bg-white/10 ${isActive ? 'bg-white/15 font-semibold' : ''}`}>
                {item.label}
              </NavLink>)}
            </section> : null;
          })}
        </div>
      </nav>
    </header>
    <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
  </div>;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: authApi.session, retry: false });
  const login = useMutation({
    mutationFn: () => authApi.login(email, password),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(['auth', 'session'], user);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from || '/', { replace: true });
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });
  useEffect(() => {
    const expire = () => { queryClient.clear(); };
    window.addEventListener('auth:expired', expire);
    return () => window.removeEventListener('auth:expired', expire);
  }, [queryClient]);
  if (session.isSuccess) return <Navigate to="/" replace />;
  return <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
    <form className="w-full max-w-sm rounded-xl bg-white p-6 shadow" onSubmit={(event) => { event.preventDefault(); setErrorMessage(''); login.mutate(); }}>
      <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
      <p className="mt-1 text-sm text-slate-600">Acceso para el equipo Unicornio.</p>
      <label className="mt-5 block text-sm font-medium" htmlFor="email">Correo</label>
      <input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
      <label className="mt-4 block text-sm font-medium" htmlFor="password">Contraseña</label>
      <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
      {errorMessage && <p role="alert" className="mt-3 text-sm text-red-700">{errorMessage}</p>}
      <button type="submit" disabled={login.isPending} className="mt-5 w-full rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60">
        {login.isPending ? 'Validando…' : 'Entrar'}
      </button>
    </form>
  </main>;
}

export function HomePage() {
  return <section>
    <h1 className="text-2xl font-semibold">Inicio</h1>
    <p className="mt-2 text-slate-600">Selecciona un módulo desde el menú según tu acceso.</p>
  </section>;
}
