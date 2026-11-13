import { useQuery } from '@tanstack/react-query';
import { authApi } from '../../shared/api/auth';

export function AuditPage() {
  const audit = useQuery({ queryKey: ['auth', 'audit'], queryFn: authApi.audit });
  return <section className="space-y-4">
    <header>
      <h1 className="text-2xl font-semibold">Auditoría</h1>
      <p className="mt-1 text-sm text-slate-600">Registro inmutable de intentos y resultados de cambios. Los registros anteriores a este slice conservan actor vacío.</p>
    </header>
    {audit.isPending && <p role="status">Cargando auditoría…</p>}
    {audit.error && <div role="alert" className="rounded border border-red-300 bg-red-50 p-3">
      <p>{audit.error.message}</p>
      <button className="mt-2 rounded border px-3 py-2" onClick={() => void audit.refetch()}>Reintentar</button>
    </div>}
    {audit.data?.length === 0 && <p className="rounded border bg-white p-4">Todavía no hay eventos de auditoría.</p>}
    {audit.data?.map((event) => <article key={event.id} className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold">{event.accion}</h2>
        <time className="text-sm text-slate-600" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('es-MX')}</time>
      </div>
      <p className="mt-1 text-sm">{event.actor?.nombre ?? 'Sin actor autenticado'}{event.actor ? ` · ${event.actor.email}` : ''}</p>
      <p className="mt-1 break-all font-mono text-xs text-slate-700">{event.metodo} {event.ruta} · {event.resultado}</p>
      {event.requestId && <p className="mt-1 text-xs text-slate-500">Solicitud {event.requestId}</p>}
    </article>)}
  </section>;
}
