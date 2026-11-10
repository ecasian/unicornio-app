import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import type { TurnoInventario } from '../../shared/api/inventario-sucursales';
import { sucursalesApi } from '../../shared/api/sucursales';
import { stockObjetivoSucursalesApi } from '../../shared/api/stock-objetivo-sucursales';

export function StockObjetivoSucursalPage() {
  const client = useQueryClient();
  const [sucursalId, setSucursalId] = useState<number | ''>('');
  const [fecha, setFecha] = useState('');
  const [turno, setTurno] = useState<TurnoInventario | ''>('');
  const [ediciones, setEdiciones] = useState<Record<number, string>>({});
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const branches = useQuery({ queryKey: ['sucursales'], queryFn: sucursalesApi.list });
  const flavors = useQuery({ queryKey: ['sucursales', 'sabores'], queryFn: sucursalesApi.listSabores });
  const goalKey = ['stock-objetivo-sucursal', sucursalId] as const;
  const goals = useQuery({ queryKey: goalKey, queryFn: () => stockObjetivoSucursalesApi.get(Number(sucursalId)), enabled: Boolean(sucursalId) });
  const compareKey = ['stock-objetivo-sucursal', 'comparacion', sucursalId, fecha, turno] as const;
  const comparison = useQuery({ queryKey: compareKey, queryFn: () => stockObjetivoSucursalesApi.compare(Number(sucursalId), fecha, turno as TurnoInventario), enabled: Boolean(sucursalId && fecha && turno) });
  const selected = branches.data?.find((branch) => branch.id === sucursalId);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: () => {
      const inactive = goals.data?.objetivos.filter((item) => !item.saborActivo).map((item) => ({ saborId: item.saborId, litros: item.litros })) ?? [];
      const active = (flavors.data ?? []).flatMap((flavor) => {
        const value = (ediciones[flavor.id] ?? goals.data?.objetivos.find((item) => item.saborId === flavor.id)?.litros ?? '').trim();
        return value === '' ? [] : [{ saborId: flavor.id, litros: value }];
      });
      return stockObjetivoSucursalesApi.replace(Number(sucursalId), [...active, ...inactive]);
    },
    onSuccess: (data) => {
      setDirty(false);
      setEdiciones({});
      setNotice('Objetivos base guardados. No generan pedidos ni modifican inventarios.');
      client.setQueryData(goalKey, data);
      void client.invalidateQueries({ queryKey: ['stock-objetivo-sucursal', 'comparacion', sucursalId] });
    },
  });

  function changeBranch(value: number | '') {
    if (dirty && !window.confirm('Hay cambios de objetivos sin guardar. ¿Descartarlos y cambiar de sucursal?')) return;
    setSucursalId(value);
    setEdiciones({});
    setDirty(false);
    setNotice('');
  }

  function guardNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (dirty && !window.confirm('Hay cambios de objetivos sin guardar. ¿Salir sin guardarlos?')) event.preventDefault();
  }

  const error = (branches.error || flavors.error || goals.error || comparison.error || save.error) as Error | null;
  const pending = branches.isPending || flavors.isPending || (Boolean(sucursalId) && goals.isPending);
  const inventoryLabel = comparison.data?.inventarioEstado === 'AUSENTE' ? 'Sin snapshot para esta fecha y turno' : comparison.data?.inventarioEstado === 'BORRADOR' ? 'Hay un borrador; la comparación usa solo snapshots confirmados' : 'Snapshot confirmado para la fecha y turno elegidos';

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="bg-fuchsia-800 px-4 py-4 text-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2"><Link to="/" onClick={guardNavigation} className="font-semibold underline">Unicornio</Link><nav className="flex flex-wrap gap-4"><Link to="/sucursales" onClick={guardNavigation} className="underline">Concentrado</Link><Link to="/sucursales/propuesta-abastecimiento" onClick={guardNavigation} className="underline">Propuesta diaria</Link><Link to="/inventario-sucursales" onClick={guardNavigation} className="underline">Inventario por turno</Link><span>Objetivo de stock</span></nav></div></header>
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <section className="rounded-xl bg-white p-5 shadow-sm"><h1 className="text-2xl font-bold">Stock objetivo de sucursales</h1><p className="mt-1 text-slate-600">Objetivo base permanente en litros deseados tras abastecimiento. Fer y Jonathan pueden configurarlo; no calcula pedidos ni ajusta inventario.</p>
        <label className="mt-4 grid max-w-xl gap-1 text-sm">Sucursal<select value={sucursalId} onChange={(event) => changeBranch(event.currentTarget.value ? Number(event.currentTarget.value) : '')} className="min-h-11 rounded border px-3"><option value="">Seleccionar sucursal</option>{branches.data?.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}{branch.activo ? '' : ' · inactiva'}</option>)}</select></label>
      </section>
      {(pending || comparison.isPending) && <p role="status" className="rounded bg-white p-4">Cargando sucursales y objetivos…</p>}
      {error && <div role="alert" className="rounded bg-red-100 p-4 text-red-900"><p>{error.message}</p><button type="button" onClick={() => { void branches.refetch(); void flavors.refetch(); if (sucursalId) void goals.refetch(); if (fecha && turno) void comparison.refetch(); }} className="mt-2 min-h-11 rounded bg-red-800 px-4 font-semibold text-white">Reintentar</button></div>}
      {notice && <p role="status" className="rounded bg-emerald-100 p-4 text-emerald-900">{notice}</p>}
      {selected && goals.data && <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Objetivos base · {selected.nombre}</h2><p className="mt-1 text-sm text-slate-600">Campo vacío significa sin objetivo configurado. Ingresa 0 para configurar un objetivo explícito de cero litros. Los cambios por jornada pertenecen a otro proceso.</p>
        {!selected.activo && <p className="mt-3 rounded bg-amber-50 p-3 text-amber-950">Sucursal inactiva: puedes consultar sus objetivos, pero no modificarlos.</p>}
        {flavors.data?.length === 0 && goals.data.objetivos.length === 0 && <p className="mt-3 text-slate-600">No hay sabores activos para configurar.</p>}
        <div className="mt-4 space-y-2">{flavors.data?.map((flavor) => { const value = ediciones[flavor.id] ?? goals.data?.objetivos.find((item) => item.saborId === flavor.id)?.litros ?? ''; return <label key={flavor.id} className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,10rem)] items-center gap-3 rounded border p-3"><span>{flavor.nombre}<span className="block text-xs text-slate-500">{value === '' ? 'Sin objetivo configurado' : 'Objetivo explícito'}</span></span><span className="flex items-center gap-2"><input aria-label={`Objetivo en litros para ${flavor.nombre}`} inputMode="decimal" type="number" min="0" max="99999999999.999" step="0.001" value={value} disabled={!selected.activo || save.isPending} onChange={(event) => { const nextValue = event.currentTarget.value; setEdiciones((current) => ({ ...current, [flavor.id]: nextValue })); setDirty(true); setNotice(''); }} className="min-h-11 w-full min-w-0 rounded border px-2" /><span>L</span></span></label>; })}
          {goals.data.objetivos.filter((item) => !item.saborActivo).map((item) => <div key={item.saborId} className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,10rem)] items-center gap-3 rounded border border-amber-300 bg-amber-50 p-3"><span>{item.sabor}<span className="block text-xs text-amber-900">Sabor inactivo · objetivo preservado</span></span><span className="text-right font-semibold">{item.litros} L</span></div>)}
        </div>
        {goals.data.objetivos.some((item) => !item.saborActivo) && <p className="mt-3 text-sm text-amber-900">Los objetivos de sabores inactivos se preservan al guardar y no se pueden cambiar aquí.</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={!dirty || !selected.activo || save.isPending} onClick={() => save.mutate()} className="min-h-11 rounded bg-fuchsia-800 px-5 font-semibold text-white disabled:opacity-50">{save.isPending ? 'Guardando…' : 'Guardar objetivos base'}</button>{dirty && <button type="button" onClick={() => { setEdiciones({}); setDirty(false); }} className="min-h-11 rounded border px-4">Descartar cambios</button>}</div>
      </section>}
      <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Comparación informativa</h2><p className="mt-1 text-sm text-slate-600">Compara objetivos con un único inventario confirmado de la fecha y turno elegidos. No suma turnos y no genera surtido ni pedido.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm">Fecha<input type="date" value={fecha} onChange={(event) => setFecha(event.currentTarget.value)} className="min-h-11 rounded border px-3" /></label><label className="grid gap-1 text-sm">Turno<select value={turno} onChange={(event) => setTurno((event.currentTarget.value || '') as TurnoInventario | '')} className="min-h-11 rounded border px-3"><option value="">Seleccionar turno</option><option value="MATUTINO">Matutino</option><option value="VESPERTINO">Vespertino</option></select></label><p className="self-end pb-3 text-sm text-slate-500">Elige sucursal, fecha y turno.</p></div>
        {sucursalId && fecha && turno && !comparison.isPending && !comparison.data && !error && <p role="status" className="mt-3 rounded bg-slate-50 p-3 text-slate-600">No hay datos de comparación.</p>}
        {comparison.data && <><p role="status" className="mt-3 rounded bg-slate-50 p-3 text-sm">{comparison.data.sucursal.nombre} · {comparison.data.fecha} · {comparison.data.turno}. {inventoryLabel}.</p>{comparison.data.comparaciones.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[38rem] border-collapse text-left text-sm"><thead><tr className="border-b"><th className="p-2">Sabor</th><th className="p-2">Objetivo base</th><th className="p-2">Existencia</th><th className="p-2">Objetivo − existencia</th></tr></thead><tbody>{comparison.data.comparaciones.map((item) => <tr key={item.saborId} className="border-b"><th className="p-2 font-medium">{item.sabor}{item.saborActivo ? '' : ' · inactivo'}</th><td className="p-2">{item.objetivoConfigurado ? `${item.objetivoLitros} L` : 'Sin objetivo'}</td><td className="p-2">{item.existenciaRegistrada ? `${item.existenciaLitros} L` : 'Sin dato'}</td><td className="p-2">{item.diferenciaLitros === null ? 'No disponible' : `${item.diferenciaLitros} L`}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-slate-600">No hay sabores ni datos configurados para comparar.</p>}</>}
      </section>
    </div>
  </main>;
}
