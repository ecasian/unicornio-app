import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { sucursalesApi } from '../../shared/api/sucursales';
import { propuestasAbastecimientoApi, type PropuestaAbastecimiento } from '../../shared/api/propuestas-abastecimiento';

const proposalKey = (fecha: string) => ['propuestas-abastecimiento', fecha] as const;

export function PropuestaAbastecimientoPage() {
  const client = useQueryClient();
  const [fecha, setFecha] = useState('');
  const [sucursalId, setSucursalId] = useState<number | ''>('');
  const [propuesta, setPropuesta] = useState<PropuestaAbastecimiento | null>(null);
  const [decisiones, setDecisiones] = useState<Record<number, string>>({});
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const branches = useQuery({ queryKey: ['sucursales'], queryFn: sucursalesApi.list });
  const list = useQuery({ queryKey: proposalKey(fecha), queryFn: () => propuestasAbastecimientoApi.list(fecha), enabled: Boolean(fecha) });
  const queryKey = ['propuesta-abastecimiento', propuesta?.id] as const;
  const detail = useQuery({ queryKey, queryFn: () => propuestasAbastecimientoApi.get(propuesta!.id), enabled: Boolean(propuesta?.id) });
  const current = detail.data ?? propuesta;
  const draftExists = list.data?.propuestas.some((item) => item.sucursalId === sucursalId && item.estado === 'BORRADOR') ?? false;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const refresh = async (result: PropuestaAbastecimiento) => {
    setPropuesta(result); setDecisiones(Object.fromEntries(result.detalles.map((item) => [item.saborId, item.decisionLitros ?? '']))); setDirty(false); setNotice('');
    await Promise.all([client.invalidateQueries({ queryKey: proposalKey(fecha) }), client.invalidateQueries({ queryKey: ['propuesta-abastecimiento', result.id] })]);
  };
  const create = useMutation({ mutationFn: () => propuestasAbastecimientoApi.create(Number(sucursalId), fecha), onSuccess: (result) => { void refresh(result); } });
  const save = useMutation({ mutationFn: () => propuestasAbastecimientoApi.decisions(current!.id, current!.detalles.filter((item) => item.saborActivo).map((item) => { const value = (decisiones[item.saborId] ?? '').trim(); return { saborId: item.saborId, decisionLitros: value === '' ? null : value }; })), onSuccess: async (result) => { await refresh(result); setNotice('Decisiones guardadas en el borrador.'); }, onError: () => { void detail.refetch(); } });
  const recalculate = useMutation({ mutationFn: () => propuestasAbastecimientoApi.recalculate(current!.id), onSuccess: async (result) => { await refresh(result); setNotice('Nueva versión creada con la fuente vigente; revisa y vuelve a capturar decisiones manuales.'); } });
  const confirm = useMutation({ mutationFn: () => propuestasAbastecimientoApi.confirm(current!.id), onSuccess: async (result) => { await refresh(result); setNotice('Propuesta confirmada e inmutable.'); }, onError: () => { void detail.refetch(); } });
  const error = (branches.error || list.error || detail.error || create.error || save.error || recalculate.error || confirm.error) as Error | null;

  function guard(event: MouseEvent<HTMLAnchorElement>) { if (dirty && !window.confirm('Hay decisiones sin guardar. ¿Salir sin guardarlas?')) event.preventDefault(); }
  function pickProposal(item: PropuestaAbastecimiento) {
    if (dirty && !window.confirm('Hay decisiones sin guardar. ¿Descartarlas?')) return;
    setPropuesta(item); setDecisiones(Object.fromEntries(item.detalles.map((detail) => [detail.saborId, detail.decisionLitros ?? '']))); setDirty(false); setNotice('');
  }

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="bg-fuchsia-800 px-4 py-4 text-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3"><Link to="/" onClick={guard} className="font-semibold underline">Unicornio</Link><nav className="flex flex-wrap gap-4"><Link to="/sucursales" onClick={guard} className="underline">Concentrado</Link><Link to="/inventario-sucursales" onClick={guard} className="underline">Inventario por turno</Link><span>Propuesta diaria</span></nav></div></header>
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <section className="rounded-xl bg-white p-5 shadow-sm"><h1 className="text-2xl font-bold">Propuesta de abastecimiento diario</h1><p className="mt-1 text-slate-600">La referencia es el inventario vespertino confirmado del día anterior y el objetivo base. Esta propuesta no crea pedidos ni modifica inventarios.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm">Fecha de abastecimiento<input type="date" value={fecha} onChange={(event) => { if (dirty && !window.confirm('Descartar decisiones sin guardar?')) return; setFecha(event.currentTarget.value); setPropuesta(null); setDirty(false); setNotice(''); }} className="min-h-11 rounded border px-3" /></label><label className="grid gap-1 text-sm">Sucursal<select value={sucursalId} onChange={(event) => { if (dirty && !window.confirm('Descartar decisiones sin guardar?')) return; setSucursalId(event.currentTarget.value ? Number(event.currentTarget.value) : ''); setPropuesta(null); setDirty(false); setNotice(''); }} className="min-h-11 rounded border px-3"><option value="">Seleccionar sucursal</option>{branches.data?.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}{branch.activo ? '' : ' · inactiva'}</option>)}</select></label><button type="button" disabled={!fecha || !sucursalId || list.isPending || draftExists || create.isPending || !branches.data?.find((item) => item.id === sucursalId)?.activo} onClick={() => create.mutate()} className="min-h-11 self-end rounded bg-fuchsia-800 px-4 font-semibold text-white disabled:opacity-50">{create.isPending ? 'Preparando…' : 'Crear / nueva versión'}</button></div>
      </section>
      {(branches.isPending || list.isPending || detail.isPending) && <p role="status" aria-live="polite" className="rounded bg-white p-4">Cargando sucursales y propuestas…</p>}
      {error && <div role="alert" className="rounded bg-red-100 p-4 text-red-900"><p>{error.message}</p><button type="button" onClick={() => { void branches.refetch(); if (fecha) void list.refetch(); if (propuesta) void detail.refetch(); }} className="mt-2 min-h-11 rounded bg-red-800 px-4 text-white">Reintentar</button></div>}
      {fecha && list.data && <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Resumen del día · {fecha}</h2>{list.data.propuestas.length ? <><div className="mt-3 space-y-2">{list.data.propuestas.map((item) => <button key={item.id} type="button" onClick={() => pickProposal(item)} className={`min-h-11 w-full rounded border p-3 text-left ${current?.id === item.id ? 'border-fuchsia-700 bg-fuchsia-50' : ''}`}>{item.sucursal.nombre} · versión {item.version} · {item.estado}{item.obsoleta ? ' · fuente obsoleta' : ''}</button>)}</div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[32rem] border-collapse text-left text-sm"><thead><tr className="border-b"><th className="p-2">Sucursal</th><th className="p-2">Sabor</th><th className="p-2">Cantidad decidida</th><th className="p-2">Estado</th></tr></thead><tbody>{list.data.propuestas.flatMap((item) => item.detalles.map((row) => <tr key={`${item.id}:${row.saborId}`} className="border-b"><td className="p-2">{item.sucursal.nombre}</td><th className="p-2 font-medium">{row.sabor}</th><td className="p-2">{row.decisionLitros === null ? 'Sin decidir' : `${row.decisionLitros} L`}</td><td className="p-2">{item.estado}</td></tr>))}</tbody></table></div></> : <p className="mt-2 text-slate-600">Aún no hay propuestas para esta fecha.</p>}</section>}
      {current && <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">{current.sucursal.nombre} · {current.fecha} · versión {current.version}</h2><p className="mt-1 text-sm text-slate-600">Estado: {current.estado}. Fuente: {current.fuente.reporteId ? `inventario #${current.fuente.reporteId}, vespertino confirmado ${current.fuente.fecha}${current.fuente.confirmadoAt ? ` a las ${current.fuente.confirmadoAt} UTC` : ''}` : 'sin inventario vespertino confirmado'} · Zona operativa: {current.timezone}</p>
        {current.obsoleta && <div role="alert" className="mt-3 rounded bg-amber-100 p-3 text-amber-950">La referencia cambió. No se puede confirmar esta versión. Recalcula para crear una nueva y vuelve a revisar las cantidades.</div>}
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[48rem] border-collapse text-left text-sm"><thead><tr className="border-b"><th className="p-2">Sabor</th><th className="p-2">Objetivo</th><th className="p-2">Existencia origen</th><th className="p-2">Sugerencia</th><th className="p-2">Cantidad decidida</th><th className="p-2">Referencia</th></tr></thead><tbody>{current.detalles.map((item) => <tr key={item.saborId} className="border-b"><th className="p-2 font-medium">{item.sabor}{item.saborActivo ? '' : ' · inactivo'}</th><td className="p-2">{item.objetivoLitros === null ? 'Sin dato' : <><span>{item.objetivoLitros} L</span>{item.objetivoActualizadoAt && <span className="block text-xs text-slate-500">Objetivo actualizado {item.objetivoActualizadoAt} UTC</span>}</>}</td><td className="p-2">{item.existenciaLitros === null ? 'Sin dato' : `${item.existenciaLitros} L`}</td><td className="p-2">{item.sugerenciaLitros === null ? 'SIN DATOS' : `${item.sugerenciaLitros} L`}</td><td className="p-2"><div className="flex min-w-36 items-center gap-2"><input aria-label={`Cantidad decidida en litros para ${item.sabor}`} type="number" inputMode="decimal" min="0" step="0.001" value={decisiones[item.saborId] ?? ''} disabled={current.estado !== 'BORRADOR' || current.obsoleta || !item.saborActivo || save.isPending} onChange={(event) => { const value = event.currentTarget.value; setDecisiones((values) => ({ ...values, [item.saborId]: value })); setDirty(true); setNotice(''); }} className="min-h-10 w-full min-w-0 rounded border px-2" /><span>L</span></div></td><td className="p-2">{item.estadoReferencia === 'SIN_DATOS' ? 'SIN DATOS' : `Inventario ${current.fuente.fecha} · VESPERTINO`}</td></tr>)}</tbody></table></div>
        {current.detalles.length === 0 && <p className="mt-3 text-slate-600">No hay sabores activos o referencias para proponer.</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          {notice && <p role="status" aria-live="polite" className="basis-full rounded bg-emerald-100 p-3 text-emerald-900">{notice}</p>}
          {current.estado === 'BORRADOR' && <>
            <button type="button" disabled={!dirty || current.obsoleta || save.isPending} onClick={() => save.mutate()} className="min-h-11 rounded bg-fuchsia-800 px-5 font-semibold text-white disabled:opacity-50">{save.isPending ? 'Guardando…' : 'Guardar borrador'}</button>
            <button type="button" disabled={dirty || current.obsoleta || confirm.isPending || current.detalles.some((item) => item.saborActivo && (decisiones[item.saborId] ?? '') === '')} onClick={() => confirm.mutate()} className="min-h-11 rounded bg-emerald-700 px-5 font-semibold text-white disabled:opacity-50">Confirmar propuesta</button>
            {current.obsoleta && <button type="button" disabled={recalculate.isPending} onClick={() => { if (dirty && !window.confirm('La nueva versión reinicia las decisiones manuales sin guardar. ¿Continuar?')) return; recalculate.mutate(); }} className="min-h-11 rounded border border-amber-700 px-4 text-amber-950">{recalculate.isPending ? 'Recalculando…' : 'Crear versión recalculada'}</button>}
            {dirty && <button type="button" onClick={() => { setDecisiones(Object.fromEntries(current.detalles.map((item) => [item.saborId, item.decisionLitros ?? '']))); setDirty(false); setNotice(''); }} className="min-h-11 rounded border px-4">Descartar cambios</button>}
          </>}
        </div>
      </section>}
    </div>
  </main>;
}
