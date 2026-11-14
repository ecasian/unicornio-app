import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, type InternalUser } from '../../shared/api/auth';

const roleLabels: Record<string, string> = {
  ADMIN_GENERAL: 'Administrador general',
  ADMIN_SUCURSALES: 'Administrador de sucursales',
  REPARTIDOR: 'Repartidor',
  OPERADOR_PRODUCCION: 'Operador de producción',
};

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ nombre: '', email: '', password: '', roles: [] as string[], repartidorId: '' });
  const [pendingRoles, setPendingRoles] = useState<Record<number, string[]>>({});
  const [passwords, setPasswords] = useState<Record<number, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const users = useQuery({ queryKey: ['auth', 'users'], queryFn: authApi.users });
  const roles = useQuery({ queryKey: ['auth', 'roles'], queryFn: authApi.roles });
  const needsCourier = form.roles.includes('REPARTIDOR');
  const couriers = useQuery({ queryKey: ['auth', 'active-couriers'], queryFn: authApi.activeCouriers, enabled: needsCourier });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['auth', 'users'] });
  const create = useMutation({
    mutationFn: () => authApi.createUser({
      nombre: form.nombre,
      email: form.email,
      password: form.password,
      roles: form.roles,
      ...(form.repartidorId ? { repartidorId: Number(form.repartidorId) } : {}),
    }),
    onSuccess: () => { setForm({ nombre: '', email: '', password: '', roles: [], repartidorId: '' }); setMessage('Usuario creado.'); setError(''); void invalidate(); },
    onError: (reason: Error) => { setError(reason.message); setMessage(''); },
  });
  const setActive = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => authApi.setActive(id, activo),
    onSuccess: () => { setMessage('Estado actualizado. Las sesiones del usuario desactivado se revocaron.'); setError(''); void invalidate(); },
    onError: (reason: Error) => { setError(reason.message); setMessage(''); },
  });
  const setUserRoles = useMutation({
    mutationFn: ({ id, selected }: { id: number; selected: string[] }) => authApi.setRoles(id, selected),
    onSuccess: () => { setMessage('Roles actualizados y sesiones anteriores revocadas.'); setError(''); void invalidate(); },
    onError: (reason: Error) => { setError(reason.message); setMessage(''); },
  });
  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) => authApi.resetPassword(id, password),
    onSuccess: (_result, variables) => { setPasswords({ ...passwords, [variables.id]: '' }); setMessage('Contraseña actualizada y sesiones revocadas.'); setError(''); },
    onError: (reason: Error) => { setError(reason.message); setMessage(''); },
  });
  const roleInput = (selected: string[], onChange: (next: string[]) => void, idPrefix: string) => <fieldset className="flex flex-wrap gap-3">
    <legend className="mb-1 text-sm font-medium">Roles</legend>
    {(roles.data ?? []).map((role) => <label key={role.codigo} className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={selected.includes(role.codigo)} onChange={(event) => onChange(event.target.checked ? [...selected, role.codigo] : selected.filter((code) => code !== role.codigo))} aria-label={`${idPrefix} ${roleLabels[role.codigo] ?? role.nombre}`} />
      {roleLabels[role.codigo] ?? role.nombre}
    </label>)}
  </fieldset>;
  return <section className="space-y-6">
    <header><h1 className="text-2xl font-semibold">Usuarios y roles</h1><p className="mt-1 text-sm text-slate-600">Las cuentas no se eliminan; se desactivan. Cambiar roles revoca sus sesiones activas.</p></header>
    <form className="space-y-4 rounded-lg border bg-white p-4" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
      <h2 className="text-lg font-medium">Crear usuario interno</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Nombre<input required minLength={2} className="mt-1 block w-full rounded border px-3 py-2" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} /></label>
        <label className="text-sm">Correo<input required type="email" autoComplete="off" className="mt-1 block w-full rounded border px-3 py-2" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label className="text-sm">Contraseña inicial (12 a 128 caracteres)<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" className="mt-1 block w-full rounded border px-3 py-2" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        {needsCourier && <label className="text-sm">Repartidor asignado
          <select required className="mt-1 block w-full rounded border px-3 py-2" value={form.repartidorId} onChange={(event) => setForm({ ...form, repartidorId: event.target.value })}>
            <option value="">Selecciona un Repartidor activo</option>
            {(couriers.data ?? []).map((courier) => <option key={courier.id} value={courier.id}>{courier.nombre}</option>)}
          </select>
          {couriers.isPending && <span role="status" className="mt-1 block">Cargando repartidores…</span>}
          {couriers.error && <span role="alert" className="mt-1 block text-red-700">{couriers.error.message}</span>}
          {couriers.data?.length === 0 && <span className="mt-1 block text-amber-700">No hay Repartidores activos para asignar.</span>}
        </label>}
      </div>
      {roleInput(form.roles, (selected) => setForm({ ...form, roles: selected, repartidorId: selected.includes('REPARTIDOR') ? form.repartidorId : '' }), 'Crear')}
      <button className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60" disabled={create.isPending || !form.roles.length || (needsCourier && (!form.repartidorId || !couriers.data?.some((courier) => String(courier.id) === form.repartidorId)))}>{create.isPending ? 'Creando…' : 'Crear usuario'}</button>
    </form>
    {message && <p role="status" className="text-sm text-green-800">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <section className="space-y-3" aria-label="Usuarios existentes">
      <h2 className="text-lg font-medium">Cuentas</h2>
      {users.isPending && <p role="status">Cargando usuarios…</p>}
      {users.error && <p role="alert">{users.error.message}</p>}
      {users.data?.length === 0 && <p>No hay usuarios registrados.</p>}
      {users.data?.map((user: InternalUser) => {
        const selected = pendingRoles[user.id] ?? user.roles.map(({ rol }) => rol.codigo);
        return <article key={user.id} className="space-y-3 rounded-lg border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-medium">{user.nombre}</h3><p className="text-sm text-slate-600">{user.email}{user.repartidorId ? ` · Repartidor ${user.repartidorId}` : ''}</p></div>
            <button className="rounded border px-3 py-2 text-sm" disabled={setActive.isPending} onClick={() => setActive.mutate({ id: user.id, activo: !user.activo })}>{user.activo ? 'Desactivar' : 'Activar'}</button>
          </div>
          {roleInput(selected, (next) => setPendingRoles({ ...pendingRoles, [user.id]: next }), `Usuario ${user.email}`)}
          {pendingRoles[user.id] && <button className="rounded bg-slate-700 px-3 py-2 text-sm text-white" disabled={setUserRoles.isPending} onClick={() => setUserRoles.mutate({ id: user.id, selected })}>Guardar roles</button>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="text-sm">Restablecer contraseña<input type="password" minLength={12} maxLength={128} autoComplete="new-password" className="mt-1 block w-full rounded border px-3 py-2 sm:w-72" value={passwords[user.id] ?? ''} onChange={(event) => setPasswords({ ...passwords, [user.id]: event.target.value })} /></label>
            <button className="self-end rounded border px-3 py-2 text-sm" disabled={resetPassword.isPending || (passwords[user.id]?.length ?? 0) < 12} onClick={() => resetPassword.mutate({ id: user.id, password: passwords[user.id] ?? '' })}>Guardar contraseña</button>
          </div>
        </article>;
      })}
    </section>
  </section>;
}
