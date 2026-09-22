import { useQuery } from '@tanstack/react-query';
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
