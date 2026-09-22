import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiConfigurationError, fetchHealth } from './health';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('fetchHealth', () => {
  it('consults the configured API health endpoint', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHealth()).resolves.toEqual({
      status: 'ok',
    });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/health');
  });

  it.each([undefined, '', '   '])(
    'rejects missing or empty VITE_API_URL (%s) before fetching',
    async (apiUrl) => {
      vi.stubEnv('VITE_API_URL', apiUrl);
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expect(fetchHealth()).rejects.toBeInstanceOf(ApiConfigurationError);
      await expect(fetchHealth()).rejects.toThrow(
        'Configuración incompleta: define VITE_API_URL.',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
