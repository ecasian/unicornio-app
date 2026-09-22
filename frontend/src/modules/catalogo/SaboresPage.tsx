import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { catalogoApi, type PresentacionState, type Sabor, type SaborInput, type SaborUpdate } from '../../shared/api/catalogo';
import { AdminHeader } from '../../shared/components/AdminHeader';
import { SaborForm } from './SaborForm';
import { SaborPresentacionesForm } from './SaborPresentacionesForm';

type Editor = { kind: 'create' } | { kind: 'edit'; sabor: Sabor } | null;

export function SaboresPage() {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<Editor>(null);
  const [configId, setConfigId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const sabores = useQuery({ queryKey: ['sabores'], queryFn: catalogoApi.listSabores });
  const presentaciones = useQuery({ queryKey: ['presentaciones'], queryFn: catalogoApi.listPresentaciones });
  const saborPresentaciones = useQuery({
    queryKey: ['sabores', configId, 'presentaciones'],
    queryFn: () => catalogoApi.getSaborPresentaciones(configId!),
    enabled: configId !== null,
  });
  const create = useMutation({ mutationFn: catalogoApi.createSabor, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sabores'] }) });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: SaborUpdate }) => catalogoApi.updateSabor(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sabores'] }),
  });
  const replacePresentaciones = useMutation({
    mutationFn: ({ id, data }: { id: number; data: PresentacionState[] }) => catalogoApi.replaceSaborPresentaciones(id, data),
    onSuccess: (_result, { id }) => queryClient.invalidateQueries({ queryKey: ['sabores', id, 'presentaciones'] }),
  });

  async function save(data: SaborInput) {
    if (editor?.kind === 'edit') await update.mutateAsync({ id: editor.sabor.id, data });
    else await create.mutateAsync(data);
    setFeedback(editor?.kind === 'edit' ? 'Sabor actualizado.' : 'Sabor creado.');
    setEditor(null);
  }

  async function toggle(sabor: Sabor) {
    setActionError('');
    try {
      await update.mutateAsync({ id: sabor.id, data: { activo: !sabor.activo } });
      setFeedback(sabor.activo ? 'Sabor desactivado.' : 'Sabor activado.');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado.');
    }
  }

  async function savePresentaciones(data: PresentacionState[]) {
    if (configId === null) return;
    await replacePresentaciones.mutateAsync({ id: configId, data });
    setFeedback('Presentaciones actualizadas.');
    setConfigId(null);
  }

  const configSabor = sabores.data?.find((sabor) => sabor.id === configId);
  const configStateKey = saborPresentaciones.data?.map((item) => `${item.presentacionId}:${item.habilitada}`).join(',');

  return <main className="min-h-screen bg-gradient-to-b from-fuchsia-900 via-fuchsia-800 to-fuchsia-950 pb-16 text-white">
    <AdminHeader current="Sabores" />
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-widest text-fuchsia-200">Administrador</p><h1 className="text-3xl font-bold">Sabores</h1></div><button onClick={() => { setEditor({ kind: 'create' }); setConfigId(null); setFeedback(''); }} className="min-h-12 rounded-full bg-pink-500 px-6 font-bold text-white">Nuevo sabor</button></div>
      {feedback && <p role="status" className="rounded-xl bg-emerald-100 p-4 text-emerald-900">{feedback}</p>}
      {actionError && <p role="alert" className="rounded-xl bg-red-100 p-4 text-red-900">{actionError}</p>}
      {editor && <SaborForm key={editor.kind === 'edit' ? editor.sabor.id : 'new'} sabor={editor.kind === 'edit' ? editor.sabor : undefined} busy={create.isPending || update.isPending} onCancel={() => setEditor(null)} onSave={save} />}
      {sabores.isPending || presentaciones.isPending ? <p role="status">Cargando catálogo…</p> :
        sabores.isError || presentaciones.isError ? <div role="alert" className="rounded-2xl bg-white p-5 text-red-800"><p>No se pudo cargar el catálogo: {sabores.error?.message ?? presentaciones.error?.message}</p><button onClick={() => { void sabores.refetch(); void presentaciones.refetch(); }} className="mt-3 min-h-11 rounded-full bg-fuchsia-700 px-5 text-white">Reintentar</button></div> : <>
          <p className="text-fuchsia-100">Presentaciones globales: {presentaciones.data.map((item) => item.nombre).join(' y ')}.</p>
          {sabores.data.length === 0 ? <p className="rounded-2xl bg-white p-6 text-slate-700">Todavía no hay sabores. Crea el primero con «Nuevo sabor».</p> :
            <ul className="grid gap-4 md:grid-cols-2">{sabores.data.map((sabor) => <li key={sabor.id} className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-bold text-fuchsia-900">{sabor.nombre}</h2><span className={`rounded-full px-3 py-1 text-sm font-semibold ${sabor.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{sabor.activo ? 'Activo' : 'Inactivo'}</span></div>
              <div className="mt-5 flex flex-wrap gap-3"><button onClick={() => { setEditor({ kind: 'edit', sabor }); setConfigId(null); setFeedback(''); }} className="min-h-11 rounded-full border border-fuchsia-700 px-5 font-semibold text-fuchsia-800">Editar</button><button disabled={update.isPending && update.variables?.id === sabor.id} onClick={() => void toggle(sabor)} className="min-h-11 rounded-full bg-fuchsia-700 px-5 font-semibold text-white disabled:opacity-50">{sabor.activo ? 'Desactivar' : 'Activar'}</button><button onClick={() => { setConfigId(sabor.id); setEditor(null); setFeedback(''); }} className="min-h-11 rounded-full border border-fuchsia-700 px-5 font-semibold text-fuchsia-800">Configurar presentaciones</button></div>
            </li>)}</ul>}
        </>}
      {configId !== null && configSabor && (saborPresentaciones.isPending ? <p role="status">Cargando presentaciones del sabor…</p> : saborPresentaciones.isError ? <div role="alert" className="rounded-2xl bg-white p-5 text-red-800"><p>No se pudieron cargar las presentaciones: {saborPresentaciones.error.message}</p><button onClick={() => void saborPresentaciones.refetch()} className="mt-3 min-h-11 rounded-full bg-fuchsia-700 px-5 text-white">Reintentar</button></div> : <SaborPresentacionesForm key={`${configId}-${configStateKey}`} saborNombre={configSabor.nombre} presentaciones={saborPresentaciones.data} busy={replacePresentaciones.isPending} onCancel={() => setConfigId(null)} onSave={savePresentaciones} />)}
    </div>
  </main>;
}
