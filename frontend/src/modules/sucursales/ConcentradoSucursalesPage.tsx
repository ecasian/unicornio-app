import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { sucursalesApi, type NecesidadDetalle } from '../../shared/api/sucursales';

export function ConcentradoSucursalesPage() {
  const client = useQueryClient();
  const [fecha, setFecha] = useState('');
  const [sucursalId, setSucursalId] = useState<number | ''>('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [items, setItems] = useState<NecesidadDetalle[]>([]);
  const [saborId, setSaborId] = useState<number | ''>('');
  const [capacidad, setCapacidad] = useState<4 | 6 | 10>(10);
  const [cantidad, setCantidad] = useState(0);
  const [notice, setNotice] = useState('');
  const sucursales = useQuery({ queryKey: ['sucursales'], queryFn: sucursalesApi.list });
  const sabores = useQuery({ queryKey: ['sucursales', 'sabores'], queryFn: sucursalesApi.listSabores });
  const reportKey = fecha || 'business-today';
  const report = useQuery({ queryKey: ['concentrado-sucursales', reportKey], queryFn: () => sucursalesApi.report(fecha || undefined) });
  const fechaOperativa = fecha || report.data?.fecha || '';
  const reload = () => { void client.invalidateQueries({ queryKey: ['sucursales'] }); void client.invalidateQueries({ queryKey: ['concentrado-sucursales'] }); };
  const create = useMutation({ mutationFn: sucursalesApi.create, onSuccess: () => { setNuevoNombre(''); reload(); } });
  const save = useMutation({ mutationFn: () => sucursalesApi.save(Number(sucursalId), fechaOperativa, items), onSuccess: () => { setNotice('Borrador guardado. Revísalo antes de confirmar.'); reload(); } });
  const confirm = useMutation({ mutationFn: () => sucursalesApi.confirm(Number(sucursalId), fechaOperativa), onSuccess: () => { setNotice('Necesidad confirmada para el concentrado.'); setItems([]); reload(); } });
  const selected = sucursales.data?.find((item) => item.id === sucursalId);
  const confirmed = report.data?.sucursales.some((item) => item.sucursalId === sucursalId);
  const error = [sucursales.error, sabores.error, report.error, create.error, save.error, confirm.error].find(Boolean);
  function addItem() {
    if (!saborId) return;
    if (items.some((item) => item.saborId === saborId && item.capacidadLitros === capacidad)) { setNotice('Esa combinación ya está en la lista.'); return; }
    setItems((current) => [...current, { saborId: Number(saborId), capacidadLitros: capacidad, cantidad }]);
    setNotice('');
  }

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="bg-fuchsia-800 px-4 py-4 text-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3"><Link to="/" className="font-semibold underline">Unicornio</Link><nav className="flex flex-wrap gap-4"><span>Necesidades · Fer / Jonathan</span><Link to="/sucursales/stock-objetivo" className="underline">Stock objetivo base</Link><Link to="/sucursales/propuesta-abastecimiento" className="underline">Propuesta diaria</Link><Link to="/inventario-sucursales" className="underline">Inventario por turno</Link></nav></div></header>
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <section className="rounded-xl bg-white p-5 shadow-sm"><h1 className="text-2xl font-bold">Concentrado de necesidades</h1><p className="mt-1 text-slate-600">Registra necesidades declaradas por sucursal. No representa inventario físico ni producción fabricada.</p><div className="mt-4 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">Fecha operativa<input type="date" value={fechaOperativa} onChange={(e) => { setFecha(e.currentTarget.value); setItems([]); setNotice(''); }} className="min-h-11 rounded border px-3" /></label><label className="grid gap-1 text-sm">Sucursal<select value={sucursalId} onChange={(e) => { setSucursalId(e.currentTarget.value ? Number(e.currentTarget.value) : ''); setItems([]); setNotice(''); }} className="min-h-11 min-w-52 rounded border px-3"><option value="">Seleccionar</option>{sucursales.data?.filter((item) => item.activo).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label></div></section>
      {(sucursales.isPending || sabores.isPending || report.isPending) && <p role="status" className="rounded bg-white p-4">Cargando concentrado…</p>}
      {error && <p role="alert" className="rounded bg-red-100 p-4 text-red-900">{(error as Error).message}</p>}{notice && <p role="status" className="rounded bg-emerald-100 p-4 text-emerald-900">{notice}</p>}
      <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Catálogo de sucursales</h2><p className="text-sm text-slate-600">El catálogo inicia vacío para no inventar nombres.</p><form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (nuevoNombre.trim()) create.mutate(nuevoNombre.trim()); }}><input aria-label="Nombre de sucursal" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.currentTarget.value)} className="min-h-11 rounded border px-3" placeholder="Nombre confirmado por el negocio" /><button className="min-h-11 rounded bg-fuchsia-800 px-4 font-semibold text-white">Agregar sucursal</button></form><ul className="mt-3 flex flex-wrap gap-2">{sucursales.data?.map((item) => <li key={item.id} className="rounded-full bg-slate-100 px-3 py-2">{item.nombre} · {item.activo ? 'Activa' : 'Inactiva'}{item.activo && <button type="button" onClick={() => sucursalesApi.update(item.id, { activo: false }).then(reload)} className="ml-2 underline">Desactivar</button>}</li>)}</ul></section>
      {selected && !confirmed && <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Necesidad de {selected.nombre}</h2><div className="mt-4 grid gap-3 sm:grid-cols-4"><label className="grid gap-1 text-sm">Sabor<select value={saborId} onChange={(e) => setSaborId(e.currentTarget.value ? Number(e.currentTarget.value) : '')} className="min-h-11 rounded border px-3"><option value="">Seleccionar</option>{sabores.data?.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><label className="grid gap-1 text-sm">Capacidad<select value={capacidad} onChange={(e) => setCapacidad(Number(e.currentTarget.value) as 4 | 6 | 10)} className="min-h-11 rounded border px-3"><option value={10}>10 L</option><option value={6}>6 L</option><option value={4}>4 L</option></select></label><label className="grid gap-1 text-sm">Cubetas<input type="number" min="0" step="1" value={cantidad} onChange={(e) => setCantidad(Number(e.currentTarget.value))} className="min-h-11 rounded border px-3" /></label><button type="button" onClick={addItem} className="self-end min-h-11 rounded border border-fuchsia-800 px-4 font-semibold text-fuchsia-900">Agregar renglón</button></div>
        {items.length > 0 && <ul className="mt-4 divide-y">{items.map((item) => <li key={`${item.saborId}:${item.capacidadLitros}`} className="flex items-center justify-between py-2"><span>{sabores.data?.find((s) => s.id === item.saborId)?.nombre} · {item.capacidadLitros} L</span><span>{item.cantidad} cubetas · {item.cantidad * item.capacidadLitros} L <button type="button" onClick={() => setItems((current) => current.filter((candidate) => candidate !== item))} className="ml-2 underline">Quitar</button></span></li>)}</ul>}
        <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={!fechaOperativa || !items.length || save.isPending} onClick={() => save.mutate()} className="min-h-11 rounded bg-fuchsia-800 px-5 font-semibold text-white disabled:opacity-50">Guardar borrador</button><button type="button" disabled={!fechaOperativa || !items.length || save.isPending || confirm.isPending} onClick={async () => { await save.mutateAsync(); confirm.mutate(); }} className="min-h-11 rounded bg-emerald-700 px-5 font-semibold text-white disabled:opacity-50">Guardar y confirmar</button></div>
      </section>}
      {selected && confirmed && <section className="rounded-xl bg-emerald-50 p-5 text-emerald-900"><h2 className="text-xl font-bold">Reporte confirmado</h2><p>Este reporte queda cerrado para {selected.nombre} en {fecha}.</p></section>}
      {report.data && <><section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Pendientes de confirmar</h2>{report.data.sucursalesSinConfirmar.length ? <ul className="mt-3 list-inside list-disc">{report.data.sucursalesSinConfirmar.map((item) => <li key={item.id}>{item.nombre}{!item.activo ? ' (inactiva)' : ''}</li>)}</ul> : <p className="mt-2">Todas las sucursales registradas tienen reporte confirmado.</p>}</section><section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Detalle por sucursal</h2>{report.data.sucursales.length ? report.data.sucursales.map((item) => <article key={item.sucursalId} className="mt-4 border-t pt-3"><h3 className="font-semibold">{item.sucursal}</h3><ul>{item.detalles.map((detail) => <li key={`${detail.saborId}:${detail.capacidadLitros}`}>{detail.sabor} · {detail.capacidadLitros} L: {detail.cantidad} cubetas ({detail.litrosEquivalentes} L)</li>)}</ul></article>) : <p className="mt-2 text-slate-600">Aún no hay reportes confirmados para esta fecha.</p>}</section><section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Consolidado general</h2>{report.data.consolidado.length ? <ul className="mt-3 divide-y">{report.data.consolidado.map((item) => <li key={`${item.saborId}:${item.capacidadLitros}`} className="flex justify-between py-2"><span>{item.sabor} · {item.capacidadLitros} L</span><strong>{item.cantidad} cubetas · {item.litrosEquivalentes} L</strong></li>)}</ul> : <p className="mt-2 text-slate-600">No hay necesidades confirmadas.</p>}</section></>}
    </div>
  </main>;
}
