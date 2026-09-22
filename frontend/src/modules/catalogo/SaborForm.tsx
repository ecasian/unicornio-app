import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Sabor, SaborInput } from '../../shared/api/catalogo';

type Props = {
  sabor?: Sabor;
  busy: boolean;
  onCancel: () => void;
  onSave: (data: SaborInput) => Promise<void>;
};

export function SaborForm({ sabor, busy, onCancel, onSave }: Props) {
  const [nombre, setNombre] = useState(sabor?.nombre ?? '');
  const [error, setError] = useState('');
  const nombreRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nombreRef.current?.focus(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nombre.trim()) {
      setError('Completa el nombre.');
      return;
    }
    setError('');
    try {
      await onSave({ nombre: nombre.trim() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el sabor.');
    }
  }

  return <form onSubmit={submit} className="space-y-5 rounded-2xl bg-white p-5 shadow-lg sm:p-7">
    <h2 className="text-xl font-bold text-fuchsia-900">{sabor ? 'Editar sabor' : 'Nuevo sabor'}</h2>
    <label className="block font-medium text-slate-800">Nombre
      <input ref={nombreRef} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" value={nombre} onChange={(event) => setNombre(event.target.value)} required />
    </label>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-3">
      <button disabled={busy} className="min-h-12 rounded-full bg-fuchsia-700 px-6 font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar sabor'}</button>
      <button type="button" onClick={onCancel} className="min-h-12 rounded-full border border-slate-300 px-6 font-semibold text-slate-700">Cancelar</button>
    </div>
  </form>;
}
