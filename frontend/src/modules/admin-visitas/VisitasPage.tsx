import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { adminVisitasApi } from '../../shared/api/admin-visitas';
import { clientesApi } from '../../shared/api/clientes';
import { repartidoresApi } from '../../shared/api/repartidores';
import { AdminHeader } from '../../shared/components/AdminHeader';

function formatArrival(value: string, timezone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('es-MX', { ...options, timeZone: timezone }).format(new Date(value));
}

function formatBusinessDate(fecha: string) {
  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

export function VisitasPage() {
  const [fecha, setFecha] = useState<string>();
  const [clienteId, setClienteId] = useState<number>();
  const [repartidorId, setRepartidorId] = useState<number>();
  const query = useQuery({
    queryKey: ['admin-visitas', fecha ?? 'hoy', clienteId ?? null, repartidorId ?? null],
    queryFn: () => adminVisitasApi.list({ fecha, clienteId, repartidorId }),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const clientes = useQuery({ queryKey: ['clientes'], queryFn: clientesApi.list });
  const repartidores = useQuery({ queryKey: ['repartidores'], queryFn: repartidoresApi.list });

  return <main className="min-h-screen bg-gradient-to-b from-fuchsia-900 via-fuchsia-800 to-fuchsia-950 pb-16 text-white">
    <AdminHeader current="Visitas" />
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-8 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-fuchsia-200">Administrador</p>
        <h1 className="text-3xl font-bold">Visitas</h1>
        <p className="mt-2 text-fuchsia-100">Consulta las llegadas registradas por los repartidores en cada tienda.</p>
      </div>

      <section aria-label="Filtros de visitas" className="grid gap-4 rounded-2xl bg-white p-5 text-slate-800 sm:grid-cols-3">
        <label className="grid gap-2 text-sm font-semibold">
          Fecha
          <input type="date" value={fecha ?? query.data?.fecha ?? ''} onChange={(event) => setFecha(event.target.value || undefined)} className="min-h-11 rounded-lg border border-slate-300 px-3 font-normal" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Cliente
          <select value={clienteId ?? ''} onChange={(event) => setClienteId(event.target.value ? Number(event.target.value) : undefined)} disabled={clientes.isPending || clientes.isError} className="min-h-11 rounded-lg border border-slate-300 px-3 font-normal disabled:bg-slate-100">
            <option value="">Todos los clientes</option>
            {clientes.data?.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}{cliente.activo ? '' : ' · Inactivo'}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Repartidor
          <select value={repartidorId ?? ''} onChange={(event) => setRepartidorId(event.target.value ? Number(event.target.value) : undefined)} disabled={repartidores.isPending || repartidores.isError} className="min-h-11 rounded-lg border border-slate-300 px-3 font-normal disabled:bg-slate-100">
            <option value="">Todos los repartidores</option>
            {repartidores.data?.map((repartidor) => <option key={repartidor.id} value={repartidor.id}>{repartidor.nombre}{repartidor.activo ? '' : ' · Inactivo'}</option>)}
          </select>
        </label>
      </section>

      {query.data && <p className="text-sm text-fuchsia-100">Fecha consultada: <strong>{formatBusinessDate(query.data.fecha)}</strong> ({query.data.timezone})</p>}
      {clientes.isError && <p role="alert" className="rounded-xl bg-red-100 p-4 text-red-900">No se pudieron cargar los clientes para filtrar.</p>}
      {repartidores.isError && <p role="alert" className="rounded-xl bg-red-100 p-4 text-red-900">No se pudieron cargar los repartidores para filtrar.</p>}

      {query.isPending ? <p role="status" className="rounded-2xl bg-white p-6 text-slate-700">Cargando visitas…</p> :
        query.isError ? <div role="alert" className="rounded-2xl bg-white p-5 text-red-800"><p>No se pudieron cargar las visitas: {query.error.message}</p><button onClick={() => void query.refetch()} className="mt-3 min-h-11 rounded-full bg-fuchsia-700 px-5 text-white">Reintentar</button></div> :
          query.data.visitas.length === 0 ? <p className="rounded-2xl bg-white p-6 text-slate-700">No hay visitas registradas para esta fecha con los filtros seleccionados.</p> : <>
            <div className="hidden overflow-hidden rounded-2xl bg-white text-slate-800 shadow-sm sm:block">
              <table className="w-full text-left">
                <thead className="bg-fuchsia-100 text-sm text-fuchsia-950"><tr><th scope="col" className="px-5 py-3">Fecha</th><th scope="col" className="px-5 py-3">Hora de llegada</th><th scope="col" className="px-5 py-3">Cliente</th><th scope="col" className="px-5 py-3">Repartidor</th></tr></thead>
                <tbody className="divide-y divide-slate-200">{query.data.visitas.map((visita) => <tr key={visita.id}>
                  <td className="px-5 py-4">{formatArrival(visita.llegadaAt, query.data.timezone, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-5 py-4 font-semibold">{formatArrival(visita.llegadaAt, query.data.timezone, { hour: 'numeric', minute: '2-digit' })}</td>
                  <td className="px-5 py-4">{visita.cliente.nombre}</td><td className="px-5 py-4">{visita.repartidor.nombre}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <ul className="grid gap-3 sm:hidden">{query.data.visitas.map((visita) => <li key={visita.id} className="rounded-2xl bg-white p-5 text-slate-800 shadow-sm">
              <p className="text-sm text-slate-600">{formatArrival(visita.llegadaAt, query.data.timezone, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatArrival(visita.llegadaAt, query.data.timezone, { hour: 'numeric', minute: '2-digit' })}</p>
              <p className="mt-2 font-bold text-fuchsia-900">{visita.cliente.nombre}</p><p className="text-sm text-slate-700">Repartidor: {visita.repartidor.nombre}</p>
            </li>)}</ul>
          </>}
    </div>
  </main>;
}
