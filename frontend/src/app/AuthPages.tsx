import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router';
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
  { group: 'Administración', label: 'Fichas de repartidores', to: '/admin/repartidores', permission: 'repartidores:manage' },
  { group: 'Administración', label: 'Sabores', to: '/admin/sabores', permission: 'catalogo:manage' },
  { group: 'Administración', label: 'Visitas', to: '/admin/visitas', permission: 'visitas:read' },
] as const;

const groups = ['Sucursales', 'Reparto', 'Producción', 'Administración'] as const;
type NavigationGroup = (typeof groups)[number];

function currentNavigationItem(pathname: string, permissions: string[]) {
  return navItems
    .filter((item) => permissions.includes(item.permission)
      && (pathname === item.to || pathname.startsWith(`${item.to}/`)))
    .sort((left, right) => right.to.length - left.to.length)[0];
}

const roleLabels: Record<string, string> = {
  ADMIN_GENERAL: 'Administrador general',
  ADMIN_SUCURSALES: 'Administrador de sucursales',
  REPARTIDOR: 'Repartidor',
  OPERADOR_PRODUCCION: 'Operador de producción',
};

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
  return <AppShell user={session.data}><Outlet context={session.data} /></AppShell>;
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
  return <section className="mx-auto max-w-xl rounded-lg border bg-white p-6" role="alert">
    <h1 className="text-xl font-semibold">Acceso no autorizado</h1>
    <p className="mt-2 text-slate-600">Tu cuenta no tiene permiso para abrir este módulo.</p>
  </section>;
}

export function RouteNotFound() {
  return <section className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm" role="status">
    <p className="text-sm font-semibold uppercase tracking-wide text-fuchsia-800">Página no encontrada</p>
    <h1 className="mt-1 text-2xl font-semibold">No existe esta ruta</h1>
    <p className="mt-2 text-slate-600">Comprueba la dirección o vuelve al inicio para abrir un proceso disponible.</p>
    <Link to="/" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-fuchsia-800 px-5 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-800">Ir al inicio</Link>
  </section>;
}

function AppShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  const location = useLocation();
  const [openMenuPath, setOpenMenuPath] = useState<string | null>(null);
  const menuOpen = openMenuPath === location.pathname;
  const [openGroups, setOpenGroups] = useState<Set<NavigationGroup>>(() => new Set());
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const menuButton = useRef<HTMLButtonElement>(null);
  const activeItem = currentNavigationItem(location.pathname, user.permissions);
  const activeGroup = activeItem?.group;
  const homeIsActive = location.pathname === '/';
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenMenuPath(null);
      menuButton.current?.focus();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="bg-slate-900 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <Link to="/" className="shrink-0 rounded text-lg font-bold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Unicornio</Link>
        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="min-w-0 text-right leading-tight">
            <span className="block max-w-36 truncate text-sm font-semibold sm:max-w-64">{user.nombre}</span>
            <span className="block max-w-44 truncate text-xs text-slate-300 sm:max-w-64">{user.roles.map((role) => roleLabels[role] ?? role).join(' · ')}</span>
          </div>
          <button ref={menuButton} type="button" className="min-h-11 rounded border border-slate-500 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:hidden" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setOpenMenuPath(menuOpen ? null : location.pathname)}>
            {menuOpen ? 'Cerrar menú' : 'Menú'}
          </button>
          <button type="button" className="min-h-11 shrink-0 rounded bg-white/10 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => logout.mutate()} disabled={logout.isPending}>
            {logout.isPending ? 'Saliendo…' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
      <nav id="main-navigation" aria-label="Navegación principal" className={`${menuOpen ? 'block' : 'hidden'} border-t border-white/15 px-4 py-3 sm:px-6 md:block`}>
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:flex-wrap md:items-start md:gap-5">
          <Link to="/" aria-current={homeIsActive ? 'page' : undefined} className={`rounded px-2 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${homeIsActive ? 'bg-white/15 font-semibold' : ''}`} onClick={() => setOpenMenuPath(null)}>Inicio</Link>
          {groups.map((group) => {
            const visible = navItems.filter((item) => item.group === group && user.permissions.includes(item.permission));
            if (!visible.length) return null;
            const expanded = activeGroup === group || openGroups.has(group);
            const groupId = `navigation-group-${group.toLowerCase()}`;
            return <section key={group} aria-label={group} className="flex flex-col gap-1 md:min-w-fit md:flex-row md:items-start md:gap-2">
              <h2 className="hidden px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 md:block">{group}</h2>
              <button type="button" className="flex min-h-11 items-center justify-between rounded px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:hidden" aria-expanded={expanded} aria-controls={groupId} onClick={() => setOpenGroups((current) => {
                const next = new Set(current);
                if (activeGroup !== group && next.has(group)) next.delete(group);
                else next.add(group);
                return next;
              })}>
                {group}<span aria-hidden="true" className="ml-3 text-base">{expanded ? '−' : '+'}</span>
              </button>
              <div id={groupId} className={`${expanded ? 'flex' : 'hidden'} flex-col gap-1 md:flex md:flex-row md:flex-wrap`}>
                {visible.map((item) => {
                  const isCurrent = activeItem?.to === item.to;
                  return <Link key={item.to} to={item.to} aria-current={isCurrent ? 'page' : undefined} onClick={() => setOpenMenuPath(null)} className={`min-h-10 rounded px-2 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${isCurrent ? 'bg-white/15 font-semibold' : ''}`}>
                    {item.label}
                  </Link>;
                })}
              </div>
            </section>;
          })}
        </div>
      </nav>
    </header>
    <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
  </div>;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
    <section className="w-full max-w-md">
      <div className="mb-6 flex items-center justify-center gap-3 text-slate-900">
        <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-fuchsia-800 text-xl font-black text-white">U</span>
        <span className="text-xl font-bold tracking-tight">Unicornio</span>
      </div>
      <form className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8" onSubmit={(event) => { event.preventDefault(); setErrorMessage(''); login.mutate(); }}>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Iniciar sesión</h1>
        <p className="mt-2 text-sm text-slate-600">Acceso para el equipo Unicornio.</p>
        <label className="mt-6 block text-sm font-semibold text-slate-800" htmlFor="email">Correo</label>
        <input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-700" />
        <label className="mt-5 block text-sm font-semibold text-slate-800" htmlFor="password">Contraseña</label>
        <div className="relative mt-2">
          <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-12 w-full rounded-lg border border-slate-300 py-2 pl-3 pr-14 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-700" />
          <button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onMouseDown={(event) => event.preventDefault()} onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-1 right-1 grid min-h-10 min-w-11 place-items-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-700">
            {showPassword ? <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7"/><path d="M9.9 5.2A11.4 11.4 0 0112 5c5.2 0 8.8 5.4 9.5 6.5a1 1 0 010 1 15.8 15.8 0 01-3.2 3.8M6.2 6.3A16.3 16.3 0 002.5 11.5a1 1 0 000 1C3.2 13.6 6.8 19 12 19a10 10 0 003.2-.5"/></svg>
              : <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.5"/></svg>}
          </button>
        </div>
        {errorMessage && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{errorMessage}</p>}
        <button type="submit" disabled={login.isPending} className="mt-6 min-h-12 w-full rounded-lg bg-fuchsia-800 px-4 py-3 font-semibold text-white hover:bg-fuchsia-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-800 disabled:opacity-60">
          {login.isPending ? 'Validando…' : 'Entrar'}
        </button>
      </form>
    </section>
  </main>;
}

export function HomePage() {
  const user = useOutletContext<AuthUser>();
  const permittedItems = navItems.filter((item) => user.permissions.includes(item.permission));
  return <section className="space-y-6">
    <header>
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">{user.nombre}</p>
      <h1 className="mt-1 text-2xl font-semibold">Inicio</h1>
      <p className="mt-2 text-slate-600">Estos son los procesos disponibles para tu cuenta.</p>
    </header>
    {permittedItems.length === 0 ? <p className="rounded-xl border bg-white p-5 text-slate-700">Tu cuenta no tiene procesos asignados. Consulta con una persona administradora.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {permittedItems.map((item) => <Link key={item.to} to={item.to} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-fuchsia-300 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-700">
        <span className="text-xs font-semibold uppercase tracking-wide text-fuchsia-800">{item.group}</span>
        <span className="mt-2 block text-lg font-semibold text-slate-900">{item.label}</span>
        <span className="mt-3 block text-sm font-semibold text-fuchsia-800 group-hover:underline">Abrir proceso →</span>
      </Link>)}
    </div>}
  </section>;
}
