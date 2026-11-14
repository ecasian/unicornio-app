import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, clearCsrfToken, request } from './request';

afterEach(() => { clearCsrfToken(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function respond(body: string | null, status: number, contentType = 'application/json') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, {
    status,
    headers: { 'Content-Type': contentType },
  })));
}

describe('request', () => {
  it('returns a JSON response', async () => {
    respond('{"id":1}', 200);
    await expect(request<{ id: number }>('/clientes')).resolves.toEqual({ id: 1 });
    expect(fetch).toHaveBeenCalledWith('/api/clientes', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it.each([
    ['204 without a body', null, 204],
    ['200 with an empty body', '', 200],
  ])('accepts %s', async (_description, body, status) => {
    respond(body, status);
    await expect(request<unknown>('/clientes')).resolves.toBeUndefined();
  });

  it('returns a successful non-JSON body as text', async () => {
    respond('Listo', 200, 'text/plain');
    await expect(request<string>('/clientes')).resolves.toBe('Listo');
  });

  it.each([
    [400, { message: ['Nombre obligatorio', 'Nombre inválido'] }, 'Nombre obligatorio, Nombre inválido'],
    [404, { message: 'No encontrado' }, 'No encontrado'],
  ])('preserves status and JSON body for HTTP %i', async (status, body, message) => {
    respond(JSON.stringify(body), status);
    await expect(request('/clientes')).rejects.toMatchObject({
      name: 'ApiError', status, body, message,
    });
  });

  it('preserves status, message and text for a non-JSON error', async () => {
    respond('Servidor no disponible', 500, 'text/plain');
    await expect(request('/clientes')).rejects.toMatchObject({
      name: 'ApiError', status: 500, body: 'Servidor no disponible', message: 'Servidor no disponible',
    });
  });

  it('uses a clear fallback for an error without a body', async () => {
    respond(null, 503);
    await expect(request('/clientes')).rejects.toMatchObject({
      status: 503, body: undefined, message: 'La API respondió con HTTP 503',
    });
  });

  it('exposes an ApiError instance to callers', async () => {
    respond('{"message":"No encontrado"}', 404);
    await expect(request('/clientes')).rejects.toBeInstanceOf(ApiError);
  });

  it('obtains a same-origin CSRF token before state changes and sends it with the cookie', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/csrf');
    const mutation = fetchMock.mock.calls[1];
    expect(mutation[0]).toBe('/api/auth/logout');
    expect((mutation[1]?.headers as Headers).get('X-CSRF-Token')).toBe('csrf-token');
    expect(mutation[1]?.credentials).toBe('same-origin');
  });

  it('shares the first CSRF request between concurrent state changes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'shared-token' }), { status: 200 }))
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([
      request('/auth/logout', { method: 'POST' }),
      request('/auth/logout', { method: 'POST' }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[1][1]?.headers as Headers).get('X-CSRF-Token')).toBe('shared-token');
    expect((fetchMock.mock.calls[2][1]?.headers as Headers).get('X-CSRF-Token')).toBe('shared-token');
  });

  it('uses the rotated CSRF token returned by login for the next mutation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'pre-login' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'X-CSRF-Token': 'post-login' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await request('/auth/login', { method: 'POST' });
    await request('/auth/logout', { method: 'POST' });
    expect((fetchMock.mock.calls[2][1]?.headers as Headers).get('X-CSRF-Token')).toBe('post-login');
  });
});
