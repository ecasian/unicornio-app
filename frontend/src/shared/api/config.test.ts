import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientesApi } from './clientes';
import { API_BASE_PATH, getApiBaseUrl } from './config';
import { fetchHealth } from './health';
import { repartidoresApi } from './repartidores';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('configuración compartida de API', () => {
  it('uses a relative same-origin API path for Health, Clientes and Repartidores', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect(getApiBaseUrl()).toBe('/api');
    expect(API_BASE_PATH).toBe('/api');
    await fetchHealth();
    await clientesApi.list();
    await repartidoresApi.list();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/health',
      '/api/clientes',
      '/api/repartidores',
    ]);
  });
});
