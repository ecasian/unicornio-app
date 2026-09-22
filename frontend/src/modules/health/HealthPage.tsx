import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ApiConfigurationError, fetchHealth } from '../../shared/api/health';

export function HealthPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => fetchHealth(),
    retry: (failureCount, error) =>
      !(error instanceof ApiConfigurationError) && failureCount < 3,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Unicornio</h1>
      <Link to="/admin/clientes" className="rounded-full bg-fuchsia-700 px-6 py-3 text-center font-semibold text-white">Administrador → Clientes</Link>
      <Link to="/admin/repartidores" className="rounded-full border border-fuchsia-700 px-6 py-3 text-center font-semibold text-fuchsia-800">Administrador → Repartidores</Link>
      <p className="text-slate-600">Estado técnico de la API</p>
      <p role="status" className="rounded-lg border border-slate-200 p-4">
        {health.isPending
          ? 'Comprobando conexión…'
          : health.error instanceof ApiConfigurationError
            ? health.error.message
            : health.isError
            ? 'API no disponible'
            : health.data.status === 'ok'
              ? 'API disponible'
              : 'Respuesta inesperada de la API'}
      </p>
    </main>
  );
}
