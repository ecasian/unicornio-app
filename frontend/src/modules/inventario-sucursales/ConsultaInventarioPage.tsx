import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { inventarioSucursalesApi, type TurnoInventario } from '../../shared/api/inventario-sucursales';

export function ConsultaInventarioPage() {
  const [fecha, setFecha] = useState('');
  const [turno, setTurno] = useState<TurnoInventario | ''>('');
  const catalogs = useQuery({ queryKey: ['inventario-sucursales', 'catalogos'], queryFn: inventarioSucursalesApi.captureCatalogs });
  const fechaActiva = fecha || catalogs.data?.fecha || '';
  const summary = useQuery({
    queryKey: ['inventario-sucursales', 'resumen', fechaActiva, turno],
    queryFn: () => inventarioSucursalesApi.getSummary(turno as TurnoInventario, fecha || undefined),
    enabled: Boolean(turno),
  });
  const data = summary.data;
  const error = (catalogs.error || summary.error) as Error | null;

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="bg-fuchsia-800 px-4 py-4 text-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2"><Link to="/" className="font-semibold underline">Unicornio</Link><nav className="flex gap-4"><Link to="/inventario-sucursales" className="underline">Captura por turno</Link><span>Consulta de inventarios</span></nav></div></header>
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <section className="rounded-xl bg-white p-5 shadow-sm"><h1 className="text-2xl font-bold">Inventarios confirmados</h1><p className="mt-1 text-slate-600">Consulta una fecha y un turno. El detalle, el consolidado y los pendientes corresponden solo a esa combinación.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Fecha operativa<input type="date" value={fechaActiva} onChange={(event) => setFecha(event.currentTarget.value)} className="min-h-11 rounded border px-3" /></label><label className="grid gap-1 text-sm">Turno<select value={turno} onChange={(event) => setTurno((event.currentTarget.value || '') as TurnoInventario | '')} className="min-h-11 rounded border px-3"><option value="">Seleccionar turno</option><option value="MATUTINO">Matutino</option><option value="VESPERTINO">Vespertino</option></select></label></div>
        {catalogs.data && <p className="mt-2 text-xs text-slate-500">Fecha inicial del servidor · {catalogs.data.timezone}</p>}
        {turno === 'MATUTINO' && <p className="mt-2 rounded bg-amber-50 p-3 text-sm text-amber-950">El matutino puede informar posible necesidad vespertina; el surtido extraordinario no se calcula aquí.</p>}
        {turno === 'VESPERTINO' && <p className="mt-2 rounded bg-indigo-50 p-3 text-sm text-indigo-950">El vespertino informa el cierre para el día siguiente. No se calculan ventas a partir de diferencias entre snapshots.</p>}
      </section>
      {(catalogs.isPending || (Boolean(turno) && summary.isPending)) && <p role="status" className="rounded bg-white p-4">Cargando inventarios…</p>}
      {error && <div role="alert" className="rounded bg-red-100 p-4 text-red-900"><p>{error.message}</p><button type="button" onClick={() => { void catalogs.refetch(); if (turno) void summary.refetch(); }} className="mt-2 min-h-11 rounded bg-red-800 px-4 font-semibold text-white">Reintentar</button></div>}
      {!turno && !catalogs.isPending && <p role="status" className="rounded bg-white p-4 text-slate-600">Selecciona un turno para consultar sus inventarios.</p>}
      {data && <>
        <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Sucursales pendientes · {data.turno}</h2>{data.sucursalesPendientes.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{data.sucursalesPendientes.map((branch) => <li key={branch.id} className="rounded bg-amber-50 px-3 py-2 text-amber-950">{branch.nombre}{branch.activo ? '' : ' · inactiva'}</li>)}</ul> : <p className="mt-2 text-slate-600">Todas las sucursales tienen un inventario confirmado para este turno y fecha.</p>}</section>
        <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Detalle confirmado · {data.turno}</h2>{data.sucursales.length ? <div className="mt-3 grid gap-3">{data.sucursales.map((report) => <article key={report.id} className="rounded-lg border p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{report.sucursal}</h3><span className="text-sm text-slate-600">Confirmado {report.confirmadoAt ? new Date(report.confirmadoAt).toLocaleString('es-MX') : ''}</span></div>{report.detalles.length ? <ul className="mt-2 divide-y">{report.detalles.map((detail) => <li key={detail.saborId} className="flex justify-between gap-3 py-2"><span>{detail.sabor}</span><strong>{detail.litros} L</strong></li>)}</ul> : <p className="mt-2 text-sm text-slate-600">Reporte sin sabores registrados; no asigna litros cero a sabores ausentes.</p>}</article>)}</div> : <p className="mt-2 text-slate-600">No hay inventarios confirmados para esta fecha y turno.</p>}</section>
        <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Consolidado de litros por sabor · {data.turno}</h2><p className="mt-1 text-sm text-slate-600">Solo incluye filas explícitas confirmadas de este turno. No suma MATUTINO con VESPERTINO.</p>{data.consolidado.length ? <ul className="mt-3 divide-y">{data.consolidado.map((item) => <li key={item.saborId} className="flex justify-between gap-3 py-3"><span>{item.sabor}</span><strong>{item.litros} L</strong></li>)}</ul> : <p className="mt-2 text-slate-600">Sin litros confirmados en este turno.</p>}</section>
        <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Último inventario confirmado por sucursal · {data.turno}</h2><p className="mt-1 text-sm text-slate-600">Muestra la última fecha confirmada de ese turno, hasta la fecha consultada. No calcula ventas ni diferencias.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{data.ultimoInventarioConfirmadoPorSucursal.map((item) => <article key={item.sucursalId} className="rounded-lg border p-4"><h3 className="font-semibold">{item.sucursal}{item.activo ? '' : ' · inactiva'}</h3>{item.reporte ? <><p className="mt-1 text-sm text-slate-600">Fecha: {item.reporte.fecha}</p>{item.reporte.detalles.length ? <ul className="mt-2">{item.reporte.detalles.map((detail) => <li key={detail.saborId} className="flex justify-between gap-3 py-1"><span>{detail.sabor}</span><strong>{detail.litros} L</strong></li>)}</ul> : <p className="mt-2 text-sm text-slate-600">Sin sabores explícitos.</p>}</> : <p className="mt-1 text-sm text-slate-600">Sin inventario confirmado previo para este turno.</p>}</article>)}</div></section>
        {data.historicosAnterioresSinTurno.length > 0 && <section className="rounded-xl border border-slate-300 bg-slate-100 p-5"><h2 className="text-lg font-bold">Históricos anteriores sin turno</h2><p className="mt-1 text-sm text-slate-700">Se preservan como fueron capturados antes de esta adaptación. No se asignan a MATUTINO ni VESPERTINO y no entran en sus consolidados.</p><ul className="mt-3 grid gap-3 sm:grid-cols-2">{data.historicosAnterioresSinTurno.map(({ sucursalId, sucursal, reporte }) => <li key={sucursalId} className="rounded bg-white p-3"><strong>{sucursal} · {reporte.fecha}</strong>{reporte.detalles.map((detail) => <p key={detail.saborId} className="mt-1 flex justify-between gap-3"><span>{detail.sabor}</span><span>{detail.litros} L</span></p>)}</li>)}</ul></section>}
      </>}
    </div>
  </main>;
}
