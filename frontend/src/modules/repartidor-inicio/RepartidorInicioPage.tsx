import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { clientesApi } from '../../shared/api/clientes';
import { existenciasApi, type ExistenciaItem, type RegistroExistencias } from '../../shared/api/existencias';
import { repartidoresApi } from '../../shared/api/repartidores';
import { stockObjetivoApi, type StockObjetivo } from '../../shared/api/stock-objetivo';
import { ExistenciasForm } from './ExistenciasForm';

function FlowHeader({ step }: { step: number }) {
  const steps = ['Repartidor', 'Cliente', 'Surtido', 'Levantamiento'];
  return (
    <header className="bg-fuchsia-950 px-4 pb-7 pt-7 text-white">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold tracking-widest text-pink-200 uppercase">Yogurt Unicornio</p>
        <h1 className="mt-2 text-3xl font-bold">Ruta de reparto</h1>
        <p className="mt-2 text-sm text-fuchsia-100">Consulta el surtido antes de iniciar tu visita.</p>
        <ol aria-label="Progreso" className="mt-6 grid grid-cols-4 gap-2">
          {steps.map((name, index) => (
            <li key={name} aria-current={step === index + 1 ? 'step' : undefined}
              className={`rounded-xl px-2 py-3 text-center text-xs font-semibold sm:text-sm ${step === index + 1 ? 'bg-white text-fuchsia-950' : 'bg-fuchsia-800 text-fuchsia-100'}`}>
              {index + 1}. {name}
            </li>
          ))}
        </ol>
      </div>
    </header>
  );
}

function Notice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900">
      <p>{message}</p>
      <button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-full bg-red-800 px-5 font-semibold text-white">
        Reintentar
      </button>
    </div>
  );
}

function SurtidoResumen({ stock, onContinue }: { stock: StockObjetivo[]; onContinue: () => void }) {
  return (
    <>
      {stock.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h3 className="text-lg font-bold">Sin surtido operativo</h3>
          <p className="mt-2">Este cliente no tiene combinaciones disponibles. No puede iniciarse el levantamiento.</p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Surtido operativo">
          {stock.map((item) => (
            <li key={`${item.saborId}:${item.presentacionId}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 shadow-sm">
              <div>
                <p className="text-lg font-bold text-slate-900">{item.sabor.nombre}</p>
                <p className="mt-1 inline-block rounded-full bg-fuchsia-100 px-3 py-1 text-sm font-semibold text-fuchsia-900">
                  {item.presentacion.nombre}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Stock objetivo</p>
                <p className="text-2xl font-bold text-fuchsia-900">{item.cantidad} <span className="text-sm font-medium">envases</span></p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" disabled={stock.length === 0} onClick={onContinue}
        className="mt-6 min-h-12 w-full rounded-full bg-fuchsia-700 px-6 font-bold text-white disabled:opacity-50">
        Continuar al levantamiento
      </button>
    </>
  );
}

export function RepartidorInicioPage() {
  const [repartidorId, setRepartidorId] = useState<number | null>(null);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [captureStock, setCaptureStock] = useState<StockObjetivo[] | null>(null);
  const [registro, setRegistro] = useState<RegistroExistencias | null>(null);
  const clienteHeading = useRef<HTMLHeadingElement>(null);
  const surtidoHeading = useRef<HTMLHeadingElement>(null);
  const capturaHeading = useRef<HTMLHeadingElement>(null);
  const repartidores = useQuery({
    queryKey: ['repartidores', 'activos'], queryFn: repartidoresApi.listActive, refetchOnMount: 'always',
  });
  const repartidor = repartidores.data?.find((item) => item.id === repartidorId && item.activo);
  const clientes = useQuery({
    queryKey: ['clientes', 'activos'], queryFn: clientesApi.listActive, enabled: Boolean(repartidor), refetchOnMount: 'always',
  });
  const cliente = clientes.data?.find((item) => item.id === clienteId && item.activo);
  const stock = useQuery({
    queryKey: ['surtido-operativo', clienteId], queryFn: () => stockObjetivoApi.getOperativo(clienteId ?? 0), enabled: Boolean(cliente), refetchOnMount: 'always',
  });
  const guardar = useMutation({
    mutationFn: (items: ExistenciaItem[]) => existenciasApi.create(clienteId ?? 0, repartidorId ?? 0, items),
    onSuccess: setRegistro,
  });
  const paso = !repartidor ? 1 : !cliente ? 2 : captureStock || registro ? 4 : 3;

  function cambiarRepartidor() {
    setRepartidorId(null); setClienteId(null); setCaptureStock(null); setRegistro(null); guardar.reset();
  }

  function cambiarCliente() {
    setClienteId(null); setCaptureStock(null); setRegistro(null); guardar.reset();
  }

  useEffect(() => {
    if (paso === 2) clienteHeading.current?.focus();
    if (paso === 3) surtidoHeading.current?.focus();
    if (paso === 4) capturaHeading.current?.focus();
  }, [paso]);

  return (
    <main className="min-h-screen bg-[#f7f3f7] text-slate-900">
      <FlowHeader step={paso} />
      <div className="mx-auto max-w-3xl px-4 py-7 sm:px-6">
        {!repartidor ? (
          <section aria-labelledby="seleccionar-repartidor" className="space-y-4">
            <h2 id="seleccionar-repartidor" className="text-2xl font-bold">¿Quién realiza la visita?</h2>
            <p className="text-slate-600">Selecciona tu nombre para continuar.</p>
            {repartidores.isPending ? <p role="status">Cargando repartidores…</p>
              : repartidores.isError ? <Notice message={`No se pudieron cargar los repartidores: ${repartidores.error.message}`} onRetry={() => { void repartidores.refetch(); }} />
              : repartidores.data.filter((item) => item.activo).length === 0 ? <p className="rounded-2xl bg-white p-5">No hay repartidores activos disponibles.</p>
              : <ul className="space-y-3">{repartidores.data.filter((item) => item.activo).map((item) => <li key={item.id}>
                <button type="button" aria-label={`Seleccionar repartidor ${item.nombre}`} onClick={() => { setRepartidorId(item.id); cambiarCliente(); }}
                  className="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl bg-white px-5 py-4 text-left text-lg font-semibold shadow-sm focus-visible:outline-4 focus-visible:outline-fuchsia-600">
                  <span>{item.nombre}</span><span aria-hidden="true" className="text-fuchsia-700">→</span>
                </button>
              </li>)}</ul>}
          </section>
        ) : !cliente ? (
          <section aria-labelledby="seleccionar-cliente" className="space-y-4">
            <button type="button" onClick={cambiarRepartidor} className="min-h-11 font-semibold text-fuchsia-800 underline underline-offset-4">← Cambiar repartidor</button>
            <p className="text-sm text-slate-600">Repartidor: <strong>{repartidor.nombre}</strong></p>
            <h2 id="seleccionar-cliente" ref={clienteHeading} tabIndex={-1} className="text-2xl font-bold">Selecciona el cliente</h2>
            {clientes.isPending ? <p role="status">Cargando clientes…</p>
              : clientes.isError ? <Notice message={`No se pudieron cargar los clientes: ${clientes.error.message}`} onRetry={() => { void clientes.refetch(); }} />
              : clientes.data.filter((item) => item.activo).length === 0 ? <p className="rounded-2xl bg-white p-5">No hay clientes activos disponibles.</p>
              : <ul className="space-y-3">{clientes.data.filter((item) => item.activo).map((item) => <li key={item.id}>
                <button type="button" aria-label={`Seleccionar cliente ${item.nombre}. Dirección: ${item.direccion}`} onClick={() => { setClienteId(item.id); setCaptureStock(null); setRegistro(null); guardar.reset(); }}
                  className="block min-h-24 w-full rounded-2xl bg-white px-5 py-4 text-left shadow-sm focus-visible:outline-4 focus-visible:outline-fuchsia-600">
                  <span className="block text-lg font-bold">{item.nombre}</span>
                  <span className="mt-2 block text-sm text-slate-600">Celular: {item.celular}</span>
                  <span className="mt-1 block text-sm text-slate-600">Dirección: {item.direccion}</span>
                </button>
              </li>)}</ul>}
          </section>
        ) : (
          <section aria-labelledby="resumen-surtido" className="space-y-4">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-fuchsia-800">
              <button type="button" disabled={guardar.isPending} onClick={cambiarRepartidor} className="min-h-11 underline underline-offset-4 disabled:opacity-50">← Cambiar repartidor</button>
              <button type="button" disabled={guardar.isPending} onClick={cambiarCliente} className="min-h-11 underline underline-offset-4 disabled:opacity-50">← Cambiar cliente</button>
            </div>
            <p className="text-sm text-slate-600">Repartidor: <strong>{repartidor.nombre}</strong></p>
            {registro ? <h2 id="resumen-surtido" ref={capturaHeading} tabIndex={-1} className="text-2xl font-bold">Existencias guardadas</h2>
              : captureStock ? <h2 id="resumen-surtido" ref={capturaHeading} tabIndex={-1} className="text-2xl font-bold">Levantamiento de {cliente.nombre}</h2>
                : <h2 id="resumen-surtido" ref={surtidoHeading} tabIndex={-1} className="text-2xl font-bold">Surtido de {cliente.nombre}</h2>}
            <div className="rounded-2xl bg-white p-5 text-sm shadow-sm">
              <p><strong>Celular:</strong> {cliente.celular}</p>
              <p className="mt-1"><strong>Dirección:</strong> {cliente.direccion}</p>
            </div>
            {registro ? (
              <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-5 text-green-950">
                <p className="text-lg font-bold">Registro de existencias guardado correctamente</p>
                <p className="mt-2">Cliente: {registro.cliente.nombre}</p>
                <p>Repartidor: {registro.repartidor.nombre}</p>
                <p>Fecha y hora: {new Date(registro.createdAt).toLocaleString('es-MX')}</p>
                <p>Combinaciones registradas: {registro.detalles.length}</p>
              </div>
            ) : captureStock ? (
              <>
                <button type="button" disabled={guardar.isPending} onClick={() => { setCaptureStock(null); guardar.reset(); }} className="min-h-11 font-semibold text-fuchsia-800 underline underline-offset-4 disabled:opacity-50">← Volver al surtido</button>
                {stock.isError && <Notice message={`No se pudo comprobar el surtido actual: ${stock.error.message}`} onRetry={() => { void stock.refetch(); }} />}
                <ExistenciasForm initialStock={captureStock} currentStock={stock.data ?? captureStock}
                  isSaving={guardar.isPending} isStockUnavailable={stock.isError || stock.isFetching}
                  saveError={guardar.error?.message ?? null}
                  onSave={(items) => guardar.mutate(items)}
                  onReload={() => { setCaptureStock(null); guardar.reset(); void stock.refetch(); }} />
              </>
            ) : stock.isPending || stock.isFetching ? <p role="status">Cargando surtido…</p>
              : stock.isError ? <Notice message={`No se pudo cargar el surtido: ${stock.error.message}`} onRetry={() => { void stock.refetch(); }} />
              : <SurtidoResumen stock={stock.data} onContinue={() => { setCaptureStock(stock.data); guardar.reset(); }} />}
          </section>
        )}
      </div>
    </main>
  );
}
