import { useState, type FormEvent } from 'react';
import type { ExistenciaItem, RegistroExistencias } from '../../shared/api/existencias';
import type { StockObjetivo } from '../../shared/api/stock-objetivo';

const key = (item: Pick<StockObjetivo, 'saborId' | 'presentacionId'>) => `${item.saborId}:${item.presentacionId}`;
const signature = (stock: StockObjetivo[]) => stock.map((item) => `${key(item)}:${item.cantidad}`).join('|');
const sameCombinations = (details: RegistroExistencias['detalles'], stock: StockObjetivo[]) => {
  const current = new Set(stock.map(key));
  return details.length === current.size && details.every((item) => current.has(key(item)));
};

type Props = {
  initialStock: StockObjetivo[];
  currentStock: StockObjetivo[];
  isSaving: boolean;
  isStockUnavailable: boolean;
  saveError: string | null;
  onSave: (items: ExistenciaItem[]) => void;
  onReload: () => void;
  initialValues?: ExistenciaItem[];
  submitLabel?: string;
  correctionDetails?: RegistroExistencias['detalles'];
};

export function ExistenciasForm({ initialStock, currentStock, isSaving, isStockUnavailable, saveError, onSave, onReload, initialValues, submitLabel, correctionDetails }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(
    (initialValues ?? []).map((item) => [key(item), String(item.cantidad)]),
  ));
  const [validation, setValidation] = useState<string | null>(null);
  const changed = correctionDetails ? !sameCombinations(correctionDetails, currentStock)
    : signature(initialStock) !== signature(currentStock);
  const errorChanged = saveError?.includes('surtido operativo cambió');
  const rows = correctionDetails ?? initialStock;
  const currentTargets = new Map(currentStock.map((item) => [key(item), item.cantidad]));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const items: ExistenciaItem[] = [];
    for (const item of rows) {
      const value = values[key(item)] ?? '';
      if (!/^\d+$/.test(value) || Number(value) > 2147483647) {
        setValidation('Captura un entero no negativo en todas las combinaciones. El campo vacío no equivale a cero.');
        return;
      }
      items.push({ saborId: item.saborId, presentacionId: item.presentacionId, cantidad: Number(value) });
    }
    setValidation(null);
    onSave(items);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <p className="text-sm text-slate-600">Registra la existencia actual de cada presentación. Escribe 0 cuando no haya envases.</p>
      {((changed && !isStockUnavailable) || errorChanged) && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <p>{correctionDetails
            ? 'El surtido de este cliente cambió después del levantamiento. Este registro no puede corregirse con la configuración actual.'
            : 'La configuración del surtido cambió. Tus cantidades siguen aquí; recarga el levantamiento antes de guardar.'}</p>
          <button type="button" onClick={onReload} className="mt-3 min-h-11 font-semibold underline underline-offset-4">Recargar levantamiento</button>
        </div>
      )}
      <ul className="space-y-3" aria-label="Captura de existencias">
        {rows.map((item) => {
          const id = `existencia-${item.saborId}-${item.presentacionId}`;
          const objetivoActual = correctionDetails ? currentTargets.get(key(item)) : item.cantidad;
          return (
            <li key={key(item)} className="rounded-2xl bg-white p-5 shadow-sm">
              <label htmlFor={id} className="block text-lg font-bold text-slate-900">{item.sabor.nombre} · {item.presentacion.nombre}</label>
              <p className="mt-1 text-sm text-slate-600">{correctionDetails ? 'Stock objetivo actual' : 'Stock objetivo'}: {objetivoActual === undefined ? 'no disponible' : `${objetivoActual} envases`}</p>
              <input id={id} type="number" min="0" max="2147483647" step="1" inputMode="numeric" required
                value={values[key(item)] ?? ''} onChange={(event) => setValues((prior) => ({ ...prior, [key(item)]: event.target.value }))}
                className="mt-3 min-h-12 w-full rounded-xl border border-slate-400 px-4 text-lg focus-visible:outline-4 focus-visible:outline-fuchsia-600"
                aria-describedby={`${id}-ayuda`} />
              <p id={`${id}-ayuda`} className="mt-1 text-xs text-slate-500">Existencia actual en envases</p>
            </li>
          );
        })}
      </ul>
      {validation && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-900">{validation}</p>}
      {saveError && !errorChanged && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-900">No se pudo guardar: {saveError}</p>}
      <button type="submit" disabled={isSaving || isStockUnavailable || changed || Boolean(errorChanged)}
        className="min-h-12 w-full rounded-full bg-fuchsia-700 px-6 font-bold text-white disabled:opacity-50">
        {isSaving ? 'Guardando existencias…' : submitLabel ?? 'Guardar existencias'}
      </button>
    </form>
  );
}
