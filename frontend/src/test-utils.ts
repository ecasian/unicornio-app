import { clearCsrfToken } from './shared/api/request';

export function withCsrfMock(apiFetch: unknown): typeof fetch {
  clearCsrfToken();
  const fetchMock = apiFetch as typeof fetch;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/auth/session') {
      return new Response(JSON.stringify({
        id: 1,
        email: 'test@example.invalid',
        nombre: 'Usuario de prueba',
        repartidorId: 1,
        roles: ['REPARTIDOR'],
        permissions: ['auth:session', 'reparto:operate'],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(input) === '/api/auth/csrf') {
      return new Response(JSON.stringify({ csrfToken: 'test-only-csrf-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return fetchMock(input, init);
  }) as typeof fetch;
}
