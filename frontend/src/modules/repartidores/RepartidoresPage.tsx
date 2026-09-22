import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { repartidoresApi, type Repartidor, type RepartidorInput, type RepartidorUpdate } from '../../shared/api/repartidores';
import { AdminHeader } from '../../shared/components/AdminHeader';
import { RepartidorForm } from './RepartidorForm';

type Editor = { kind: 'create' } | { kind: 'edit'; repartidor: Repartidor } | null;

function RepartidoresList({ repartidores, onEdit, onToggle, busyId }: {
  repartidores: Repartidor[];
  onEdit: (repartidor: Repartidor) => void;
  onToggle: (repartidor: Repartidor) => void;
  busyId?: number;
}) {
  if (repartidores.length === 0) return <p className="rounded-2xl bg-white p-6 text-slate-700">Todavía no hay repartidores. Crea el primero con «Nuevo repartidor».</p>;
  return <ul className="grid gap-4 md:grid-cols-2">{repartidores.map((repartidor) => <li key={repartidor.id} className="rounded-2xl bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-bold text-fuchsia-900">{repartidor.nombre}</h2><span className={`rounded-full px-3 py-1 text-sm font-semibold ${repartidor.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{repartidor.activo ? 'Activo' : 'Inactivo'}</span></div>
    <div className="mt-5 flex flex-wrap gap-3"><button onClick={() => onEdit(repartidor)} className="min-h-11 rounded-full border border-fuchsia-700 px-5 font-semibold text-fuchsia-800">Editar</button><button disabled={busyId === repartidor.id} onClick={() => onToggle(repartidor)} className="min-h-11 rounded-full bg-fuchsia-700 px-5 font-semibold text-white disabled:opacity-50">{repartidor.activo ? 'Desactivar' : 'Activar'}</button></div>
  </li>)}</ul>;
}

export function RepartidoresPage() {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<Editor>(null);
  const [feedback, setFeedback] = useState('');
  const [toggleError, setToggleError] = useState('');
  const repartidores = useQuery({ queryKey: ['repartidores'], queryFn: repartidoresApi.list });
  const create = useMutation({ mutationFn: repartidoresApi.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repartidores'] }) });
  const update = useMutation({ mutationFn: ({ id, data }: { id: number; data: RepartidorUpdate }) => repartidoresApi.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repartidores'] }) });

  async function save(data: RepartidorInput) {
    if (editor?.kind === 'edit') await update.mutateAsync({ id: editor.repartidor.id, data });
    else await create.mutateAsync(data);
    setFeedback(editor?.kind === 'edit' ? 'Repartidor actualizado.' : 'Repartidor creado.');
    setEditor(null);
  }

  async function toggle(repartidor: Repartidor) {
    setToggleError('');
    try {
      await update.mutateAsync({ id: repartidor.id, data: { activo: !repartidor.activo } });
      setFeedback(repartidor.activo ? 'Repartidor desactivado.' : 'Repartidor activado.');
    } catch (cause) {
      setToggleError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado.');
    }
  }

  return <main className="min-h-screen bg-gradient-to-b from-fuchsia-900 via-fuchsia-800 to-fuchsia-950 pb-16 text-white">
    <AdminHeader current="Repartidores" />
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-8 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-widest text-fuchsia-200">Administrador</p><h1 className="text-3xl font-bold">Repartidores</h1></div><button onClick={() => { setEditor({ kind: 'create' }); setFeedback(''); }} className="min-h-12 rounded-full bg-pink-500 px-6 font-bold text-white">Nuevo repartidor</button></div>
      {feedback && <p role="status" className="rounded-xl bg-emerald-100 p-4 text-emerald-900">{feedback}</p>}
      {toggleError && <p role="alert" className="rounded-xl bg-red-100 p-4 text-red-900">{toggleError}</p>}
      {editor && <RepartidorForm key={editor.kind === 'edit' ? editor.repartidor.id : 'new'} repartidor={editor.kind === 'edit' ? editor.repartidor : undefined} busy={create.isPending || update.isPending} onCancel={() => setEditor(null)} onSave={save} />}
      {repartidores.isPending ? <p role="status">Cargando repartidores…</p> : repartidores.isError ? <div role="alert" className="rounded-2xl bg-white p-5 text-red-800"><p>No se pudieron cargar los repartidores: {repartidores.error.message}</p><button onClick={() => void repartidores.refetch()} className="mt-3 min-h-11 rounded-full bg-fuchsia-700 px-5 text-white">Reintentar</button></div> : <RepartidoresList repartidores={repartidores.data} onEdit={(repartidor) => { setEditor({ kind: 'edit', repartidor }); setFeedback(''); }} onToggle={(repartidor) => void toggle(repartidor)} busyId={update.isPending ? update.variables?.id : undefined} />}
    </div>
  </main>;
}
