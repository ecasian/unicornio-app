import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { produccionApi } from '../../shared/api/produccion';

const queryKey = (fecha?: string) => ['produccion', fecha ?? 'ayer'] as const;

function formatDate(fecha: string) {
  const [year, month, day] = fecha.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatArrival(value: string, timezone: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value));
}

export function ProduccionPage() {
  const [fecha, setFecha] = useState<string | undefined>();
  const query = useQuery({ queryKey: queryKey(fecha), queryFn: () => produccionApi.get(fecha), retry: false, staleTime: 0, refetchOnMount: 'always' });
  const data = query.data;
  const yesterday = () => {
    if (fecha === undefined) void query.refetch();
    else setFecha(undefined);
  };

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="bg-indigo-800 px-4 py-4 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div><Link to="/" className="font-semibold underline underline-offset-4">Unicornio</Link><span className="mx-2" aria-hidden="true">/</span><span>Producción</span></div>
        <span className="text-sm">Consulta</span>
      </div>
    </header>
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <section className="flex flex-col gap-4 rounded-xl bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold">Producción</h1><p className="mt-1 text-sm text-slate-600">Pedidos vigentes agrupados por fecha de llegada del repartidor.</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-medium">Fecha de levantamiento
            <input type="date" value={fecha ?? data?.fecha ?? ''} onChange={(event) => setFecha(event.currentTarget.value || undefined)} className="min-h-11 rounded-lg border border-slate-300 px-3" />
          </label>
          <button type="button" onClick={yesterday} className="min-h-11 rounded-lg border border-indigo-300 px-4 font-semibold text-indigo-800">Ayer</button>
        </div>
      </section>

      {query.isPending && <p role="status" className="rounded-lg bg-white p-5">Cargando producción…</p>}
      {query.isError && <section role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5"><p>No se pudo cargar la producción: {query.error.message}</p><button type="button" onClick={() => void query.refetch()} className="mt-3 min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white">Reintentar</button></section>}
      {data && <>
        <p className="text-sm text-slate-600">Fecha consultada: <strong>{formatDate(data.fecha)}</strong> ({data.timezone})</p>
        {data.tiendas.length === 0 ? <section className="rounded-xl bg-white p-6 text-center shadow-sm"><h2 className="text-lg font-semibold">Sin producción pendiente</h2><p className="mt-2 text-slate-600">No hay pedidos vigentes para los levantamientos de esta fecha.</p></section> : <>
          <section aria-labelledby="por-tienda" className="space-y-4">
            <h2 id="por-tienda" className="text-xl font-bold">Por tienda</h2>
            {data.tiendas.map((tienda) => <article key={tienda.clienteId} className="rounded-xl bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold">{tienda.cliente}</h3>
              <div className="mt-4 space-y-4">{tienda.pedidos.map((pedido) => <section key={pedido.pedidoProduccionId} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap justify-between gap-2 text-sm text-slate-600"><span>Llegada: {formatArrival(pedido.llegadaAt, data.timezone)}</span><span>Repartidor: {pedido.repartidor}</span></div>
                <ul className="mt-3 divide-y divide-slate-100">{pedido.detalles.map((detalle) => <li key={`${detalle.saborId}:${detalle.presentacionId}`} className="flex min-h-12 items-center justify-between gap-3 py-2"><span>{detalle.sabor} · {detalle.presentacion}</span><strong>{detalle.cantidad}</strong></li>)}</ul>
              </section>)}</div>
            </article>)}
          </section>
          <section aria-labelledby="consolidado" className="rounded-xl bg-white p-5 shadow-sm">
            <h2 id="consolidado" className="text-xl font-bold">Consolidado</h2>
            <ul className="mt-3 divide-y divide-slate-100">{data.consolidado.map((detalle) => <li key={`${detalle.saborId}:${detalle.presentacionId}`} className="flex min-h-12 items-center justify-between gap-3 py-2"><span>{detalle.sabor} · {detalle.presentacion}</span><strong>{detalle.cantidad}</strong></li>)}</ul>
          </section>
        </>}
      </>}
    </main>
  </div>;
}
