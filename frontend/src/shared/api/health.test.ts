import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHealth } from './health';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('fetchHealth', () => {
  it('consults the same-origin API health endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHealth()).resolves.toEqual({
      status: 'ok',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/health', { credentials: 'same-origin' });
  });
});
