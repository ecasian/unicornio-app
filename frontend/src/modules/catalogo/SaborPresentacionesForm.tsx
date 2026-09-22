import { useState, type FormEvent } from 'react';
import type { PresentacionState, SaborPresentacion } from '../../shared/api/catalogo';

type Props = {
  saborNombre: string;
  presentaciones: SaborPresentacion[];
  busy: boolean;
  onCancel: () => void;
  onSave: (data: PresentacionState[]) => Promise<void>;
};

export function SaborPresentacionesForm({ saborNombre, presentaciones, busy, onCancel, onSave }: Props) {
  const [selected, setSelected] = useState(() => new Set(presentaciones.filter((item) => item.habilitada).map((item) => item.presentacionId)));
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await onSave(presentaciones.map((item) => ({ presentacionId: item.presentacionId, habilitada: selected.has(item.presentacionId) })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar las presentaciones.');
    }
  }

  return <form onSubmit={submit} className="space-y-5 rounded-2xl bg-white p-5 shadow-lg sm:p-7">
    <h2 className="text-xl font-bold text-fuchsia-900">Presentaciones de {saborNombre}</h2>
    <fieldset className="space-y-3 text-slate-800">
      <legend className="mb-3 font-semibold">Habilitadas para este sabor</legend>
      {presentaciones.map((item, index) => <label key={item.presentacionId} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-4 py-2">
        <input type="checkbox" autoFocus={index === 0} checked={selected.has(item.presentacionId)} onChange={(event) => {
          const next = new Set(selected);
          if (event.target.checked) next.add(item.presentacionId);
          else next.delete(item.presentacionId);
          setSelected(next);
        }} className="size-5 accent-fuchsia-700" />
        {item.nombre}
      </label>)}
    </fieldset>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-3">
      <button disabled={busy} className="min-h-12 rounded-full bg-fuchsia-700 px-6 font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar presentaciones'}</button>
      <button type="button" onClick={onCancel} className="min-h-12 rounded-full border border-slate-300 px-6 font-semibold text-slate-700">Cancelar</button>
    </div>
  </form>;
}
