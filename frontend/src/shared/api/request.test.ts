import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request } from './request';

beforeEach(() => { vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

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
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/clientes', undefined);
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
});
