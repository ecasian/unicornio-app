import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Cliente, ClienteInput } from '../../shared/api/clientes';

type Props = {
  cliente?: Cliente;
  busy: boolean;
  onCancel: () => void;
  onSave: (data: ClienteInput) => Promise<void>;
};

export function ClienteForm({ cliente, busy, onCancel, onSave }: Props) {
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [celular, setCelular] = useState(cliente?.celular ?? '');
  const [direccion, setDireccion] = useState(cliente?.direccion ?? '');
  const [manejaMedioLitro, setManejaMedioLitro] = useState(cliente?.manejaMedioLitro ?? false);
  const [error, setError] = useState('');
  const nombreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nombreRef.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (![nombre, celular, direccion].every((field) => field.trim())) {
      setError('Completa nombre, celular y dirección.');
      return;
    }
    setError('');
    try {
      await onSave({ nombre: nombre.trim(), celular: celular.trim(), direccion: direccion.trim(), manejaMedioLitro });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cliente.');
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl bg-white p-5 shadow-lg sm:p-7">
      <h2 className="text-xl font-bold text-fuchsia-900">{cliente ? 'Editar cliente' : 'Nuevo cliente'}</h2>
      <label className="block font-medium text-slate-800">Nombre
        <input ref={nombreRef} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" value={nombre} onChange={(event) => setNombre(event.target.value)} required />
      </label>
      <label className="block font-medium text-slate-800">Celular
        <input type="tel" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" value={celular} onChange={(event) => setCelular(event.target.value)} required />
      </label>
      <label className="block font-medium text-slate-800">Dirección
        <input className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" value={direccion} onChange={(event) => setDireccion(event.target.value)} required />
      </label>
      <label className="flex items-center gap-3 text-slate-800">
        <input type="checkbox" className="size-5 accent-fuchsia-700" checked={manejaMedioLitro} onChange={(event) => setManejaMedioLitro(event.target.checked)} />
        Maneja presentación de 1/2 litro
      </label>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} className="min-h-12 rounded-full bg-fuchsia-700 px-6 font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar cliente'}</button>
        <button type="button" onClick={onCancel} className="min-h-12 rounded-full border border-slate-300 px-6 font-semibold text-slate-700">Cancelar</button>
      </div>
    </form>
  );
}
