import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { abastecimientoSucursalesApi, type AbastecimientoSucursalesResumen, type EstadoAbastecimientoSucursal } from '../../shared/api/abastecimiento-sucursales';

const queryKey = (fecha?: string) => ['abastecimiento-sucursales', fecha ?? 'fecha-inicial-backend'] as const;

const statusLabel: Record<EstadoAbastecimientoSucursal, string> = {
  APROBADA: 'Aprobada',
  PENDIENTE: 'Pendiente',
  REQUIERE_REVISION: 'Requiere revisión',
  SIN_PROPUESTA: 'Sin propuesta',
};

function formatTimestamp(value: string, timezone: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value));
}

function ProposalLink({ proposalId, fecha }: { proposalId: number; fecha: string }) {
  const query = new URLSearchParams({ fecha, propuestaId: String(proposalId) });
  return <Link className="font-semibold text-fuchsia-800 underline underline-offset-2" to={`/sucursales/propuesta-abastecimiento?${query.toString()}`}>Abrir propuesta</Link>;
}

function DailySummary({ data }: { data: AbastecimientoSucursalesResumen }) {
  return <>
    <section aria-label="Estado de propuestas" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl bg-white p-4 shadow-sm"><p className="text-sm text-slate-600">Aprobadas vigentes</p><strong className="text-2xl">{data.conteos.aprobadas}</strong></div>
      <div className="rounded-xl bg-white p-4 shadow-sm"><p className="text-sm text-slate-600">Pendientes</p><strong className="text-2xl">{data.conteos.pendientes}</strong></div>
      <div className="rounded-xl bg-white p-4 shadow-sm"><p className="text-sm text-slate-600">Requieren revisión</p><strong className="text-2xl">{data.conteos.requiereRevision}</strong></div>
      <div className="rounded-xl bg-white p-4 shadow-sm"><p className="text-sm text-slate-600">Sin propuesta</p><strong className="text-2xl">{data.conteos.sinPropuesta}</strong></div>
    </section>

    {data.alertas.length > 0 && <section aria-labelledby="alerts-title" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <h2 id="alerts-title" className="font-bold">Alertas que requieren atención</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">{data.alertas.map((alert, index) => <li key={`${alert.propuestaId}:${alert.tipo}:${index}`}><span className="font-semibold">{alert.sucursal}:</span> {alert.mensaje} <ProposalLink proposalId={alert.propuestaId} fecha={data.fecha} /></li>)}</ul>
    </section>}

    <section aria-labelledby="branch-details-title" className="rounded-xl bg-white p-5 shadow-sm">
      <h2 id="branch-details-title" className="text-xl font-bold">Detalle aprobado por sucursal y sabor</h2>
      <p className="mt-1 text-sm text-slate-600">Solo se contabiliza la versión más reciente confirmada y no obsoleta. Una cantidad vacía no se interpreta como cero.</p>
      {data.sucursales.length === 0 ? <p className="mt-4 text-slate-600">No hay sucursales registradas para consultar.</p> : <div className="mt-4 space-y-4">
        {data.sucursales.map((branch) => <article key={branch.sucursalId} className="rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-semibold">{branch.sucursal}{branch.sucursalActiva ? '' : ' · inactiva (histórico)'}</h3><p className="text-sm text-slate-600">{statusLabel[branch.estado]}{branch.version === null ? '' : ` · versión ${branch.version}`}</p>{branch.confirmadoAt && <p className="text-sm text-slate-600">Confirmada: {formatTimestamp(branch.confirmadoAt, data.timezone)}</p>}</div>
            {branch.propuestaId !== null && <ProposalLink proposalId={branch.propuestaId} fecha={data.fecha} />}
          </div>
          {branch.detalle.length === 0 ? <p className="mt-3 text-sm text-slate-600">{branch.estado === 'SIN_PROPUESTA' ? 'No existe propuesta para esta fecha.' : 'La versión no tiene detalle por sabor.'}</p> : <ul className="mt-3 divide-y divide-slate-100">
            {branch.detalle.map((item) => <li key={item.saborId} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm"><span>{item.sabor}{item.saborActivo ? '' : ' · inactivo'}</span><strong>{branch.estado === 'APROBADA' ? item.litrosDecididos === null ? 'Sin decisión' : `${item.litrosDecididos} L` : 'No contabilizada'}</strong></li>)}
          </ul>}
        </article>)}
      </div>}
    </section>

    <section aria-labelledby="approved-total-title" className="rounded-xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="approved-total-title" className="text-xl font-bold">Consolidado de abastecimiento aprobado</h2><p className="text-lg font-semibold">Total: {data.totalLitrosAprobados} L</p></div>
      <p className="mt-1 text-sm text-slate-600">Son cantidades decididas en propuestas aprobadas; no representan producción fabricada ni inventario disponible. No incluye concentrados en cubetas, YogurtBase ni pedidos de clientes.</p>
      {data.consolidadoPorSabor.length === 0 ? <p className="mt-4 text-slate-600">No hay cantidades aprobadas para consolidar.</p> : <ul className="mt-3 divide-y divide-slate-100">{data.consolidadoPorSabor.map((item) => <li key={item.saborId} className="flex min-h-12 items-center justify-between gap-3 py-2"><span>{item.sabor}{item.saborActivo ? '' : ' · inactivo'}</span><strong>{item.litrosDecididos} L</strong></li>)}</ul>}
    </section>
  </>;
}

export function AbastecimientoSucursalesPage() {
  const [fecha, setFecha] = useState<string | undefined>();
  const query = useQuery({ queryKey: queryKey(fecha), queryFn: () => abastecimientoSucursalesApi.resumen(fecha), retry: false, staleTime: 0, refetchOnMount: 'always' });
  const data = query.data;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="bg-indigo-800 px-4 py-4 text-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3"><div><Link to="/" className="font-semibold underline underline-offset-4">Unicornio</Link><span className="mx-2" aria-hidden="true">/</span><Link to="/produccion" className="underline">Producción</Link><span className="mx-2" aria-hidden="true">/</span><span>Abastecimiento aprobado</span></div><Link to="/sucursales/propuesta-abastecimiento" className="text-sm underline">Propuestas diarias</Link></div></header>
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <section className="rounded-xl bg-white p-5 shadow-sm"><h1 className="text-2xl font-bold">Consolidado de abastecimiento aprobado</h1><p className="mt-1 text-slate-600">Consulta de solo lectura de la última versión aprobada y vigente por sucursal. Este resumen no registra producción fabricada ni mueve inventario.</p><label className="mt-4 grid max-w-xs gap-1 text-sm font-medium">Fecha operativa<input type="date" value={fecha ?? data?.fecha ?? ''} onChange={(event) => setFecha(event.currentTarget.value || undefined)} className="min-h-11 rounded-lg border border-slate-300 px-3" /></label>{data && <p className="mt-2 text-sm text-slate-600">Fecha consultada: {data.fecha} ({data.timezone})</p>}</section>
      {query.isPending && <p role="status" aria-live="polite" className="rounded-lg bg-white p-5">Cargando consolidado…</p>}
      {query.isError && <section role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5"><p>No se pudo cargar el abastecimiento aprobado: {query.error.message}</p><button type="button" onClick={() => void query.refetch()} className="mt-3 min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white">Reintentar</button></section>}
      {data && <DailySummary data={data} />}
    </main>
  </div>;
}
