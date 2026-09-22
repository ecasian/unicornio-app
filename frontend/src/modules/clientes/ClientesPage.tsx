import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { clientesApi, type Cliente, type ClienteInput, type ClienteUpdate } from '../../shared/api/clientes';
import { AdminHeader } from '../../shared/components/AdminHeader';
import { ClienteForm } from './ClienteForm';

type Editor = { kind: 'create' } | { kind: 'edit'; cliente: Cliente } | null;

export function ClientesList({ clientes, onEdit, onToggle, busyId }: {
  clientes: Cliente[];
  onEdit: (cliente: Cliente) => void;
  onToggle: (cliente: Cliente) => void;
  busyId?: number;
}) {
  if (clientes.length === 0) return <p className="rounded-2xl bg-white p-6 text-slate-700">Todavía no hay clientes. Crea el primero con «Nuevo cliente».</p>;
  return <ul className="grid gap-4 md:grid-cols-2">{clientes.map((cliente) => <li key={cliente.id} className="rounded-2xl bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-bold text-fuchsia-900">{cliente.nombre}</h2><span className={`rounded-full px-3 py-1 text-sm font-semibold ${cliente.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{cliente.activo ? 'Activo' : 'Inactivo'}</span></div>
    <dl className="mt-4 space-y-2 text-slate-700"><div><dt className="font-semibold">Celular</dt><dd>{cliente.celular}</dd></div><div><dt className="font-semibold">Dirección</dt><dd>{cliente.direccion}</dd></div><div><dt className="font-semibold">1/2 litro</dt><dd>{cliente.manejaMedioLitro ? 'Sí' : 'No'}</dd></div></dl>
    <div className="mt-5 flex flex-wrap gap-3"><button onClick={() => onEdit(cliente)} className="min-h-11 rounded-full border border-fuchsia-700 px-5 font-semibold text-fuchsia-800">Editar</button><button disabled={busyId === cliente.id} onClick={() => onToggle(cliente)} className="min-h-11 rounded-full bg-fuchsia-700 px-5 font-semibold text-white disabled:opacity-50">{cliente.activo ? 'Desactivar' : 'Activar'}</button></div>
  </li>)}</ul>;
}

export function ClientesPage() {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<Editor>(null);
  const [feedback, setFeedback] = useState('');
  const [toggleError, setToggleError] = useState('');
  const clientes = useQuery({ queryKey: ['clientes'], queryFn: clientesApi.list });
  const create = useMutation({ mutationFn: clientesApi.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientes'] }) });
  const update = useMutation({ mutationFn: ({ id, data }: { id: number; data: ClienteUpdate }) => clientesApi.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientes'] }) });

  async function save(data: ClienteInput) {
    if (editor?.kind === 'edit') await update.mutateAsync({ id: editor.cliente.id, data });
    else await create.mutateAsync(data);
    setFeedback(editor?.kind === 'edit' ? 'Cliente actualizado.' : 'Cliente creado.');
    setEditor(null);
  }

  async function toggle(cliente: Cliente) {
    setToggleError('');
    try {
      await update.mutateAsync({ id: cliente.id, data: { activo: !cliente.activo } });
      setFeedback(cliente.activo ? 'Cliente desactivado.' : 'Cliente activado.');
    } catch (cause) {
      setToggleError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado.');
    }
  }

  return <main className="min-h-screen bg-gradient-to-b from-fuchsia-900 via-fuchsia-800 to-fuchsia-950 pb-16 text-white">
    <AdminHeader current="Clientes" />
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-8 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-widest text-fuchsia-200">Administrador</p><h1 className="text-3xl font-bold">Clientes</h1></div><button onClick={() => { setEditor({ kind: 'create' }); setFeedback(''); }} className="min-h-12 rounded-full bg-pink-500 px-6 font-bold text-white">Nuevo cliente</button></div>
      {feedback && <p role="status" className="rounded-xl bg-emerald-100 p-4 text-emerald-900">{feedback}</p>}
      {toggleError && <p role="alert" className="rounded-xl bg-red-100 p-4 text-red-900">{toggleError}</p>}
      {editor && <ClienteForm key={editor.kind === 'edit' ? editor.cliente.id : 'new'} cliente={editor.kind === 'edit' ? editor.cliente : undefined} busy={create.isPending || update.isPending} onCancel={() => setEditor(null)} onSave={save} />}
      {clientes.isPending ? <p role="status">Cargando clientes…</p> : clientes.isError ? <div role="alert" className="rounded-2xl bg-white p-5 text-red-800"><p>No se pudieron cargar los clientes: {clientes.error.message}</p><button onClick={() => void clientes.refetch()} className="mt-3 min-h-11 rounded-full bg-fuchsia-700 px-5 text-white">Reintentar</button></div> : <ClientesList clientes={clientes.data} onEdit={(cliente) => { setEditor({ kind: 'edit', cliente }); setFeedback(''); }} onToggle={(cliente) => void toggle(cliente)} busyId={update.isPending ? update.variables?.id : undefined} />}
    </div>
  </main>;
}
