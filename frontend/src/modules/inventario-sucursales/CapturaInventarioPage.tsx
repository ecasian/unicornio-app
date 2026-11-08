import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { inventarioSucursalesApi, type TurnoInventario } from '../../shared/api/inventario-sucursales';

type Detail = { saborId: number; litros: string };
const normalized = (details: Detail[]) => [...details].sort((a, b) => a.saborId - b.saborId);

export function CapturaInventarioPage() {
  const client = useQueryClient();
  const catalogs = useQuery({ queryKey: ['inventario-sucursales', 'catalogos'], queryFn: inventarioSucursalesApi.captureCatalogs });
  const [fecha, setFecha] = useState('');
  const [turno, setTurno] = useState<TurnoInventario | ''>('');
  const [sucursalId, setSucursalId] = useState<number | ''>('');
  const [saborId, setSaborId] = useState<number | ''>('');
  const [litros, setLitros] = useState('0');
  const [draftDetalles, setDraftDetalles] = useState<Detail[] | null>(null);
  const [notice, setNotice] = useState('');
  const fechaActiva = fecha || catalogs.data?.fecha || '';
  const reportKey = ['inventario-sucursales', 'reporte', sucursalId, fechaActiva, turno] as const;
  const report = useQuery({ queryKey: reportKey, queryFn: () => inventarioSucursalesApi.getReport(Number(sucursalId), fechaActiva, turno as TurnoInventario), enabled: Boolean(sucursalId && fechaActiva && turno) });
  const saved = report.data?.reporte ?? null;
  const confirmado = saved?.estado === 'CONFIRMADO';
  const savedDetails = saved?.detalles.map(({ saborId: id, litros: value }) => ({ saborId: id, litros: value })) ?? [];
  const detalles = draftDetalles ?? savedDetails;
  const updateDetails = (change: (current: Detail[]) => Detail[]) => setDraftDetalles((current) => change(current ?? savedDetails));

  const save = useMutation({
    mutationFn: () => inventarioSucursalesApi.saveReport({ fecha: fechaActiva, sucursalId: Number(sucursalId), turno: turno as TurnoInventario, detalles }),
    onSuccess: () => { setDraftDetalles(null); setNotice('Borrador guardado. Revísalo y confirma cuando esté correcto.'); void client.invalidateQueries({ queryKey: reportKey }); },
  });
  const confirm = useMutation({
    mutationFn: () => inventarioSucursalesApi.confirmReport(saved!.id),
    onSuccess: () => { setNotice('Inventario confirmado. El reporte queda inmutable.'); void client.invalidateQueries({ queryKey: reportKey }); void client.invalidateQueries({ queryKey: ['inventario-sucursales', 'resumen'] }); },
  });
  const original = saved?.detalles.map(({ saborId: id, litros: value }) => ({ saborId: id, litros: value })) ?? [];
  const dirty = JSON.stringify(normalized(detalles)) !== JSON.stringify(normalized(original));
  const error = [catalogs.error, report.error, save.error, confirm.error].find(Boolean) as Error | undefined;
  const flavorName = (id: number) => catalogs.data?.sabores.find((flavor) => flavor.id === id)?.nombre ?? `Sabor ${id}`;
  const selectedBranch = catalogs.data?.sucursales.find((item) => item.id === sucursalId);

  function addDetail() {
    if (!saborId || detalles.some((item) => item.saborId === saborId)) return;
    updateDetails((current) => [...current, { saborId: Number(saborId), litros }]);
    setSaborId(''); setLitros('0'); setNotice('');
  }

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="bg-fuchsia-800 px-4 py-4 text-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2"><Link to="/" className="font-semibold underline">Unicornio</Link><nav className="flex gap-4"><span>Captura por turno</span><Link to="/inventario-sucursales/consulta" className="underline">Consulta de inventarios</Link></nav></div></header>
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <section className="rounded-xl bg-white p-5 shadow-sm"><h1 className="text-2xl font-bold">Inventario de sucursales por turno</h1><p className="mt-1 text-slate-600">Registra litros físicos por sabor. Solo los sabores agregados aparecen en el reporte; un sabor ausente no equivale a cero.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm">Fecha operativa<input type="date" value={fechaActiva} onChange={(event) => { setFecha(event.currentTarget.value); setDraftDetalles(null); setNotice(''); }} className="min-h-11 rounded border px-3" /></label><label className="grid gap-1 text-sm">Turno<select value={turno} onChange={(event) => { setTurno((event.currentTarget.value || '') as TurnoInventario | ''); setDraftDetalles(null); setNotice(''); }} className="min-h-11 rounded border px-3"><option value="">Seleccionar turno</option><option value="MATUTINO">Matutino</option><option value="VESPERTINO">Vespertino</option></select></label><label className="grid gap-1 text-sm">Sucursal<select value={sucursalId} onChange={(event) => { setSucursalId(event.currentTarget.value ? Number(event.currentTarget.value) : ''); setDraftDetalles(null); setNotice(''); }} className="min-h-11 rounded border px-3"><option value="">Seleccionar sucursal</option>{catalogs.data?.sucursales.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}</option>)}</select></label></div>
        {catalogs.data && <p className="mt-2 text-xs text-slate-500">Fecha inicial del servidor · {catalogs.data.timezone}</p>}
        {selectedBranch && turno && <p className="mt-2 rounded bg-blue-50 p-3 text-sm text-blue-950">Horario informativo: {selectedBranch.horarios?.[turno] ?? 'No definido en los horarios de operación.'}. La captura permanece disponible fuera de horario.</p>}
        {turno === 'MATUTINO' && <p className="mt-2 rounded bg-amber-50 p-3 text-sm text-amber-950">El turno matutino informa posible necesidad vespertina. El surtido extraordinario corresponde a otro slice.</p>}
        {turno === 'VESPERTINO' && <p className="mt-2 rounded bg-indigo-50 p-3 text-sm text-indigo-950">El turno vespertino informa el cierre para el día siguiente. No se calculan ventas comparando inventarios.</p>}
      </section>
      {(catalogs.isPending || (Boolean(sucursalId && turno) && report.isPending)) && <p role="status" className="rounded bg-white p-4">Cargando sucursales, sabores e inventario…</p>}
      {error && <div role="alert" className="rounded bg-red-100 p-4 text-red-900"><p>{error.message}</p><button type="button" onClick={() => { void catalogs.refetch(); void report.refetch(); }} className="mt-2 min-h-11 rounded bg-red-800 px-4 font-semibold text-white">Reintentar</button></div>}
      {notice && <p role="status" className="rounded bg-emerald-100 p-4 text-emerald-900">{notice}</p>}
      {Boolean(sucursalId && turno && fechaActiva && report.data) && <section className="space-y-5 rounded-xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">{selectedBranch?.nombre} · {fechaActiva} · {turno}</h2>{saved && <span className={`rounded-full px-3 py-1 text-sm font-semibold ${confirmado ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{confirmado ? 'Confirmado · inmutable' : 'Borrador editable'}</span>}</div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto] sm:items-end"><label className="grid min-w-0 gap-1 text-sm">Sabor<select value={saborId} onChange={(event) => setSaborId(event.currentTarget.value ? Number(event.currentTarget.value) : '')} disabled={confirmado} className="box-border min-h-11 w-full min-w-0 rounded border px-3"><option value="">Seleccionar sabor</option>{catalogs.data?.sabores.filter((flavor) => !detalles.some((detail) => detail.saborId === flavor.id)).map((flavor) => <option key={flavor.id} value={flavor.id}>{flavor.nombre}</option>)}</select></label><label className="grid min-w-0 gap-1 text-sm">Litros físicos<input type="number" min="0" step="0.001" value={litros} onChange={(event) => setLitros(event.currentTarget.value)} disabled={confirmado} className="box-border min-h-11 w-full min-w-0 rounded border px-3" /></label><button type="button" disabled={confirmado || !saborId || !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(litros)} onClick={addDetail} className="min-h-11 whitespace-nowrap rounded border border-fuchsia-800 px-4 font-semibold text-fuchsia-900 disabled:opacity-50">Agregar sabor</button></div>
        {detalles.length ? <ul className="divide-y rounded border">{detalles.map((detail) => <li key={detail.saborId} className="grid min-w-0 gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto] sm:items-center"><span className="min-w-0 break-words font-medium">{flavorName(detail.saborId)}</span><label className="grid min-w-0 gap-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">Litros<input aria-label={`Litros de ${flavorName(detail.saborId)}`} type="number" min="0" step="0.001" value={detail.litros} disabled={confirmado} onChange={(event) => { const value = event.currentTarget.value; updateDetails((current) => current.map((item) => item.saborId === detail.saborId ? { ...item, litros: value } : item)); }} className="box-border min-h-11 w-full min-w-0 rounded border px-3" /></label>{!confirmado && <button type="button" onClick={() => updateDetails((current) => current.filter((item) => item.saborId !== detail.saborId))} className="min-h-11 justify-self-start whitespace-nowrap rounded px-3 text-red-800 underline sm:justify-self-end">Quitar</button>}</li>)}</ul> : <p className="rounded bg-slate-50 p-4 text-slate-600">Aún no hay sabores en este borrador. No se asignan ceros automáticamente.</p>}
        {!confirmado && <div className="flex flex-wrap gap-3"><button type="button" disabled={save.isPending || !fechaActiva || !turno || !sucursalId || detalles.some((item) => !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(item.litros))} onClick={() => save.mutate()} className="min-h-11 rounded bg-fuchsia-800 px-5 font-semibold text-white disabled:opacity-50">{save.isPending ? 'Guardando…' : 'Guardar borrador'}</button>{saved && <button type="button" disabled={dirty || detalles.length === 0 || confirm.isPending || save.isPending} onClick={() => confirm.mutate()} className="min-h-11 rounded bg-emerald-700 px-5 font-semibold text-white disabled:opacity-50">{confirm.isPending ? 'Confirmando…' : 'Confirmar inventario'}</button>}</div>}
        {saved && !confirmado && dirty && <p className="text-sm text-amber-900">Guarda los cambios y revisa el borrador antes de confirmar.</p>}
        {saved && !confirmado && detalles.length === 0 && <p className="text-sm text-amber-900">Para confirmar, agrega al menos un sabor con litros explícitos, incluso cero.</p>}
      </section>}
    </div>
  </main>;
}
