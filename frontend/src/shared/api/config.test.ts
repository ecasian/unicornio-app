import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientesApi } from './clientes';
import { ApiConfigurationError, getApiBaseUrl } from './config';
import { fetchHealth } from './health';
import { repartidoresApi } from './repartidores';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('configuración compartida de API', () => {
  it('normalizes the configured base URL for Health, Clientes and Repartidores', async () => {
    vi.stubEnv('VITE_API_URL', '  http://localhost:3000/api///  ');
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect(getApiBaseUrl()).toBe('http://localhost:3000/api');
    await fetchHealth();
    await clientesApi.list();
    await repartidoresApi.list();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:3000/api/health',
      'http://localhost:3000/api/clientes',
      'http://localhost:3000/api/repartidores',
    ]);
  });

  it.each([undefined, '', '   '])('rejects an empty URL before calling fetch (%s)', async (url) => {
    vi.stubEnv('VITE_API_URL', url);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(() => getApiBaseUrl()).toThrow(ApiConfigurationError);
    await expect(fetchHealth()).rejects.toBeInstanceOf(ApiConfigurationError);
    await expect(clientesApi.list()).rejects.toBeInstanceOf(ApiConfigurationError);
    await expect(repartidoresApi.list()).rejects.toBeInstanceOf(ApiConfigurationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
