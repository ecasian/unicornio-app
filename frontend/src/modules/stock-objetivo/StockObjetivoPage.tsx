import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { catalogoApi } from '../../shared/api/catalogo';
import { clientesApi } from '../../shared/api/clientes';
import { stockObjetivoApi, type StockObjetivo, type StockObjetivoItem } from '../../shared/api/stock-objetivo';
import { AdminHeader } from '../../shared/components/AdminHeader';

type Opcion = { saborId: number; saborNombre: string; presentacionId: number; presentacionNombre: string };
type Seleccion = Record<string, string>;
const keyOf = (saborId: number, presentacionId: number) => `${saborId}:${presentacionId}`;

const selectionFrom = (stock: StockObjetivo[]): Seleccion => Object.fromEntries(
  stock.map((item) => [keyOf(item.saborId, item.presentacionId), String(item.cantidad)]),
);

function StockForm({ opciones, stock, busy, onSave }: {
  opciones: Opcion[];
  stock: StockObjetivo[];
  busy: boolean;
  onSave: (items: StockObjetivoItem[]) => Promise<void>;
}) {
  const remoteSignature = JSON.stringify({
    stock: stock.map((item) => [item.saborId, item.presentacionId, item.cantidad]),
    opciones: opciones.map((item) => [item.saborId, item.presentacionId, item.saborNombre, item.presentacionNombre]),
  });
  const [draft, setDraft] = useState(() => ({ baseline: remoteSignature, seleccion: selectionFrom(stock), dirty: false }));
  const seleccion = draft.dirty || draft.baseline === remoteSignature ? draft.seleccion : selectionFrom(stock);
  const remoteChanged = draft.dirty && draft.baseline !== remoteSignature;
  const [error, setError] = useState('');

  function reload() {
    setDraft({ baseline: remoteSignature, seleccion: selectionFrom(stock), dirty: false });
    setError('');
  }
  const grupos = opciones.reduce((map, item) => {
    const grupo = map.get(item.saborId) ?? [];
    grupo.push(item);
    map.set(item.saborId, grupo);
    return map;
  }, new Map<number, Opcion[]>());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (remoteChanged) return;
    const items: StockObjetivoItem[] = [];
    for (const opcion of opciones) {
      const valor = seleccion[keyOf(opcion.saborId, opcion.presentacionId)];
      if (valor === undefined) continue;
      const cantidad = Number(valor);
      if (valor.trim() === '' || !Number.isInteger(cantidad) || cantidad < 0 || cantidad > 2147483647) {
        setError('Cada stock incluido debe ser un entero no negativo.');
        return;
      }
      items.push({ saborId: opcion.saborId, presentacionId: opcion.presentacionId, cantidad });
    }
    try { await onSave(items); setDraft((current) => ({ ...current, dirty: false })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el stock.'); }
  }

  return <form noValidate onSubmit={(event) => void submit(event)} className="space-y-5">
    <p className="text-fuchsia-100">Desmarcado: fuera del surtido. Marcado con 0: incluido con stock objetivo cero.</p>
    {remoteChanged && <div role="alert" className="rounded-xl bg-amber-100 p-4 text-amber-950"><p>La configuración cambió mientras editabas. Tus cambios siguen aquí; recarga los datos para continuar.</p><button type="button" onClick={reload} className="mt-3 min-h-11 rounded-full border border-amber-900 px-5 font-semibold">Recargar configuración</button></div>}
    {opciones.length === 0 ? <p className="rounded-2xl bg-white p-5 text-slate-700">No hay combinaciones habilitadas para este cliente.</p> :
      [...grupos.entries()].map(([saborId, items]) => <fieldset key={saborId} className="rounded-2xl bg-white p-5 text-slate-900 shadow-sm">
        <legend className="px-1 text-lg font-bold text-fuchsia-900">{items[0].saborNombre}</legend>
        <div className="space-y-4">{items.map((item) => {
          const clave = keyOf(item.saborId, item.presentacionId);
          const incluido = seleccion[clave] !== undefined;
          return <div key={clave} className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
            <label className="flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" checked={incluido} onChange={(event) => {
              const next = { ...seleccion };
              if (event.target.checked) next[clave] = '0'; else delete next[clave];
              setDraft({ baseline: draft.dirty ? draft.baseline : remoteSignature, seleccion: next, dirty: true });
            }} className="h-5 w-5" />{item.presentacionNombre}</label>
            {incluido && <label className="flex min-h-11 items-center gap-2">Stock objetivo <input type="number" min="0" step="1" required value={seleccion[clave]} onChange={(event) => setDraft({ baseline: draft.dirty ? draft.baseline : remoteSignature, seleccion: { ...seleccion, [clave]: event.target.value }, dirty: true })} aria-label={`Stock objetivo de ${item.saborNombre}, ${item.presentacionNombre}`} className="w-28 rounded-lg border border-slate-400 px-3 py-2 text-slate-900" /></label>}
          </div>;
        })}</div>
      </fieldset>)}
    {error && <p role="alert" className="rounded-xl bg-red-100 p-4 text-red-900">{error}</p>}
    <button type="submit" disabled={busy || remoteChanged} className="min-h-12 rounded-full bg-pink-500 px-6 font-bold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar stock objetivo'}</button>
  </form>;
}

export function StockObjetivoPage() {
  const clienteId = Number(useParams().clienteId);
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');
  const [catalogReady, setCatalogReady] = useState(false);
  const cliente = useQuery({ queryKey: ['clientes', clienteId], queryFn: () => clientesApi.get(clienteId), enabled: Number.isInteger(clienteId) && clienteId > 0 });
  const stock = useQuery({ queryKey: ['stock-objetivo', clienteId], queryFn: () => stockObjetivoApi.get(clienteId), enabled: cliente.isSuccess });
  const sabores = useQuery({ queryKey: ['sabores'], queryFn: catalogoApi.listSabores, enabled: cliente.isSuccess && cliente.data.activo, refetchOnMount: 'always' });
  const activos = sabores.data?.filter((sabor) => sabor.activo) ?? [];
  const presentaciones = useQueries({ queries: activos.map((sabor) => ({
    queryKey: ['sabores', sabor.id, 'presentaciones'],
    queryFn: () => catalogoApi.getSaborPresentaciones(sabor.id),
    refetchOnMount: 'always' as const,
  })) });
  if (!catalogReady && sabores.data && !sabores.isFetching && presentaciones.every((query) => query.data && !query.isFetching)) setCatalogReady(true);
  const opciones: Opcion[] = activos.flatMap((sabor, index) => (presentaciones[index]?.data ?? [])
    .filter((item) => item.habilitada && (item.litrosEquivalentes !== 0.5 || cliente.data?.manejaMedioLitro))
    .map((item) => ({ saborId: sabor.id, saborNombre: sabor.nombre, presentacionId: item.presentacionId, presentacionNombre: item.nombre })));
  const guardar = useMutation({
    mutationFn: (items: StockObjetivoItem[]) => stockObjetivoApi.replace(clienteId, items),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['stock-objetivo', clienteId] }); setFeedback('Stock objetivo guardado.'); },
  });
  const loading = cliente.isPending || (cliente.isSuccess && (stock.isPending || (cliente.data.activo && !catalogReady)));
  const failure = (!cliente.data && cliente.error) || (!stock.data && stock.error) || (!sabores.data && sabores.error) || presentaciones.find((query) => !query.data && query.error)?.error;

  return <main className="min-h-screen bg-gradient-to-b from-fuchsia-900 via-fuchsia-800 to-fuchsia-950 pb-16 text-white">
    <AdminHeader current="Clientes" />
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-8 sm:px-6">
      <Link to="/admin/clientes" className="inline-flex min-h-11 items-center underline underline-offset-4">← Volver a Clientes</Link>
      <h1 className="text-3xl font-bold">Configurar stock{cliente.data ? ` · ${cliente.data.nombre}` : ''}</h1>
      {feedback && <p role="status" className="rounded-xl bg-emerald-100 p-4 text-emerald-900">{feedback}</p>}
      {!Number.isInteger(clienteId) || clienteId <= 0 ? <p role="alert">Cliente inválido.</p> : failure ? <div role="alert" className="rounded-2xl bg-white p-5 text-red-800"><p>No se pudo cargar el stock: {failure.message}</p><button onClick={() => { void cliente.refetch(); void stock.refetch(); void sabores.refetch(); presentaciones.forEach((query) => { void query.refetch(); }); }} className="mt-3 min-h-11 rounded-full bg-fuchsia-700 px-5 text-white">Reintentar</button></div> : loading ? <p role="status">Cargando stock objetivo…</p> : !cliente.data?.activo ? <p className="rounded-2xl bg-white p-5 text-slate-800">El cliente está inactivo. Actívalo para configurar su stock.</p> : <>
        {stock.data?.length === 0 && <p className="rounded-xl bg-white p-4 text-slate-800">Este cliente todavía no tiene stock objetivo configurado.</p>}
        <StockForm key={clienteId} opciones={opciones} stock={stock.data ?? []} busy={guardar.isPending} onSave={(items) => guardar.mutateAsync(items).then(() => undefined)} />
      </>}
    </div>
  </main>;
}
