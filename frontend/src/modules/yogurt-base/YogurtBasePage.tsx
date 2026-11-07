import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { yogurtBaseApi, type YogurtBaseLot } from '../../shared/api/yogurt-base';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
const liters = (value: number) => `${Number(value.toFixed(3))} L`;

export function YogurtBasePage() {
  const client = useQueryClient();
  const [fecha, setFecha] = useState(today);
  const [loteFecha, setLoteFecha] = useState(today);
  const [buckets, setBuckets] = useState({ '10L': 0, '6L': 0, '4L': 0 });
  const [litrosReales, setLitrosReales] = useState('');
  const [loteId, setLoteId] = useState<number | ''>('');
  const [saborId, setSaborId] = useState<number | ''>('');
  const [consumidos, setConsumidos] = useState('');
  const [obtenidos, setObtenidos] = useState('');
  const [notice, setNotice] = useState('');
  const query = useQuery({ queryKey: ['yogurt-base', fecha], queryFn: () => yogurtBaseApi.get(fecha), retry: false });
  const refresh = () => client.invalidateQueries({ queryKey: ['yogurt-base'] });
  const createLot = useMutation({ mutationFn: yogurtBaseApi.createLot, onSuccess: () => { setNotice('Lote de YogurtBase registrado.'); setLitrosReales(''); setBuckets({ '10L': 0, '6L': 0, '4L': 0 }); void refresh(); } });
  const condition = useMutation({ mutationFn: yogurtBaseApi.condition, onSuccess: () => { setNotice('Acondicionamiento confirmado y agregado al historial.'); setConsumidos(''); setObtenidos(''); void refresh(); } });
  const lots = query.data?.lotes ?? [];
  const selected = lots.find((lot) => lot.id === loteId);
  const createError = createLot.error as Error | null;
  const conditionError = condition.error as Error | null;
  const error = query.error as Error | null;
  const visibleError = error instanceof TypeError && error.message === 'Failed to fetch'
    ? 'No se pudo conectar con la API. Comprueba que el backend esté disponible e intenta de nuevo.'
    : (error || createError || conditionError)?.message;
  const submitLot = (event: React.FormEvent) => {
    event.preventDefault(); setNotice('');
    createLot.mutate({ fechaElaboracion: loteFecha, cubetas10L: buckets['10L'], cubetas6L: buckets['6L'], cubetas4L: buckets['4L'], litrosReales: Number(litrosReales) });
  };
  const submitCondition = (event: React.FormEvent) => {
    event.preventDefault(); if (!selected || !saborId) return; setNotice('');
    condition.mutate({ loteId: selected.id, saborId: Number(saborId), claveSolicitud: crypto.randomUUID(), litrosConsumidos: Number(consumidos), litrosObtenidos: Number(obtenidos) });
  };

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="bg-indigo-800 px-4 py-4 text-white"><div className="mx-auto flex max-w-6xl items-center justify-between"><Link to="/" className="font-semibold underline">Unicornio</Link><nav className="flex gap-4"><Link to="/produccion" className="underline">Pedidos de producción</Link><span>YogurtBase</span></nav></div></header>
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <section className="rounded-xl bg-white p-5 shadow-sm"><h1 className="text-2xl font-bold">YogurtBase y acondicionamiento</h1><p className="mt-1 text-slate-600">Registra lotes nocturnos y transforma base en sabores. YogurtBase es distinto del sabor Natural.</p><label className="mt-4 inline-grid gap-1 text-sm">Fecha de consulta<input type="date" value={fecha} onChange={(event) => setFecha(event.currentTarget.value)} className="min-h-11 rounded border px-3" /></label></section>
      {query.isPending && <p role="status" className="rounded bg-white p-4">Cargando lotes…</p>}
      {(error || createError || conditionError) && <div role="alert" className="rounded bg-red-100 p-4 text-red-900"><p>{visibleError}</p>{error && <button type="button" onClick={() => void query.refetch()} className="mt-2 min-h-11 rounded bg-red-800 px-4 font-semibold text-white">Reintentar</button>}</div>}
      {notice && <p role="status" className="rounded bg-emerald-100 p-4 text-emerald-900">{notice}</p>}
      {query.data && <>
        <section className="grid gap-3 sm:grid-cols-3">{[['Base disponible', query.data.resumen.litrosBaseDisponibles], ['Base procesada', query.data.resumen.litrosBaseProcesados], ['Preparado obtenido', query.data.resumen.litrosAcondicionadosObtenidos]].map(([label, value]) => <article key={String(label)} className="rounded-xl bg-white p-4 shadow-sm"><h2 className="text-sm text-slate-600">{label}</h2><p className="mt-1 text-2xl font-bold">{liters(Number(value))}</p></article>)}</section>
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><h2 className="font-semibold">Alertas y reglas pendientes</h2><p className="mt-1">D+2 requiere procesamiento obligatorio y alerta prioritaria. D+3 excede el límite y requiere revisión. El sistema no descarta ni libera producto automáticamente.</p>{query.data.reglasPendientes.map((item) => <p key={item} className="mt-1 text-sm">{item}</p>)}</section>
      <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Registrar lote nocturno</h2><form onSubmit={submitLot} className="mt-3 grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm">Fecha de elaboración<input required type="date" value={loteFecha} onChange={(e) => setLoteFecha(e.currentTarget.value)} className="min-h-11 rounded border px-3" /></label>{(['10L', '6L', '4L'] as const).map((capacity) => <label key={capacity} className="grid gap-1 text-sm">Cubetas de {capacity}<input type="number" min="0" step="1" value={buckets[capacity]} onChange={(e) => { const value = Number(e.currentTarget.value); setBuckets((old) => ({ ...old, [capacity]: value })); }} className="min-h-11 rounded border px-3" /></label>)}<label className="grid gap-1 text-sm">Volumen real medido (L)<input required type="number" min="0.001" max="99999999999.999" step="0.001" value={litrosReales} onChange={(e) => setLitrosReales(e.currentTarget.value)} className="min-h-11 rounded border px-3" /></label><p className="self-center text-sm text-slate-600">Capacidad nominal: {buckets['10L'] * 10 + buckets['6L'] * 6 + buckets['4L'] * 4} L</p><button disabled={createLot.isPending} className="min-h-11 rounded bg-indigo-800 px-4 font-semibold text-white disabled:opacity-50">Registrar lote</button></form></section>
        <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Acondicionar parcialmente un lote</h2><form onSubmit={submitCondition} className="mt-3 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Lote disponible<select required value={loteId} onChange={(e) => setLoteId(e.currentTarget.value ? Number(e.currentTarget.value) : '')} className="min-h-11 rounded border px-3"><option value="">Seleccionar lote</option>{lots.filter((lot) => lot.litrosRestantes > 0).map((lot) => <option key={lot.id} value={lot.id}>Lote {lot.id} · {lot.fechaElaboracion} · {liters(lot.litrosRestantes)} disponibles</option>)}</select></label><label className="grid gap-1 text-sm">Sabor destino<select required value={saborId} onChange={(e) => setSaborId(e.currentTarget.value ? Number(e.currentTarget.value) : '')} className="min-h-11 rounded border px-3"><option value="">Seleccionar sabor</option>{query.data.saboresDestino.map((sabor) => <option key={sabor.id} value={sabor.id}>{sabor.nombre}</option>)}</select></label><label className="grid gap-1 text-sm">Litros de base consumidos<input required type="number" min="0.001" max={selected?.litrosRestantes} step="0.001" value={consumidos} onChange={(e) => setConsumidos(e.currentTarget.value)} className="min-h-11 rounded border px-3" /></label><label className="grid gap-1 text-sm">Litros obtenidos del sabor<input required type="number" min="0.001" step="0.001" value={obtenidos} onChange={(e) => setObtenidos(e.currentTarget.value)} className="min-h-11 rounded border px-3" /></label><button disabled={!selected || !saborId || condition.isPending} className="min-h-11 rounded bg-emerald-700 px-4 font-semibold text-white disabled:opacity-50">Confirmar acondicionamiento</button></form>{selected && <p className="mt-2 text-sm text-slate-600">Restante después de esta operación: {liters(Math.max(0, selected.litrosRestantes - Number(consumidos || 0)))} · Diferencia de rendimiento: {liters(Number(obtenidos || 0) - Number(consumidos || 0))}</p>}</section>
        <section className="space-y-3"><h2 className="text-xl font-bold">Lotes e historial</h2>{lots.length === 0 && <p className="rounded-xl bg-white p-5">No hay lotes para esta fecha de consulta.</p>}{lots.map((lot: YogurtBaseLot) => <article key={lot.id} className="rounded-xl bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">Lote {lot.id} · Elaborado {lot.fechaElaboracion}</h3><span className={lot.alertaPrioritaria || lot.requiereRevisionPorLimite ? 'font-semibold text-amber-800' : 'text-slate-600'}>{lot.estadoTemporal.replaceAll('_', ' ')} · D+{lot.edadCalendarioDias}</span></div>{lot.alertaPrioritaria && <p role="alert" className="mt-2 font-bold text-amber-800">Prioridad: procesamiento obligatorio hoy.</p>}{lot.requiereRevisionPorLimite && <p role="alert" className="mt-2 font-bold text-red-800">Límite excedido: requiere revisión. El lote permanece registrado y no se libera automáticamente.</p>}<p className="mt-2 text-sm text-slate-700">Cubetas: 10 L × {lot.cubetas['10L']}, 6 L × {lot.cubetas['6L']}, 4 L × {lot.cubetas['4L']} · Equivalencia {liters(lot.litrosEquivalentes)} · Real {liters(lot.litrosReales)}</p><p className="mt-1 font-medium">Procesados {liters(lot.litrosConsumidos)} · Restantes {liters(lot.litrosRestantes)} · Obtenidos {liters(lot.litrosObtenidos)}</p>{lot.acondicionamientos.length > 0 && <ul className="mt-3 divide-y">{lot.acondicionamientos.map((move) => <li key={move.id} className="py-2 text-sm">{new Date(move.createdAt).toLocaleString('es-MX')} · {move.sabor}: {liters(move.litrosConsumidos)} → {liters(move.litrosObtenidos)} · Diferencia {liters(move.diferenciaRendimiento)}</li>)}</ul>}</article>)}</section>
        <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="font-bold">Necesidades confirmadas de sucursales · solo referencia</h2><p className="text-sm text-slate-600">No se descuentan de YogurtBase ni del inventario.</p>{query.data.necesidadesSucursalReferencia.length ? <ul className="mt-2">{query.data.necesidadesSucursalReferencia.map((item, index) => <li key={`${item.saborId}-${item.capacidadLitros}-${index}`} className="py-1">{item.sabor} · {item.cantidad} cubetas de {item.capacidadLitros} L ({liters(item.litrosReferencia)})</li>)}</ul> : <p className="mt-2 text-sm">Sin necesidades confirmadas para la fecha.</p>}</section>
      </>}
    </div>
  </main>;
}
