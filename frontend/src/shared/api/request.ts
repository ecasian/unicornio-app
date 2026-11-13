import { getApiBaseUrl } from './config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | null = null;
let csrfTokenPromise: Promise<string> | null = null;
let csrfGeneration = 0;

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (!csrfTokenPromise) {
    const generation = csrfGeneration;
    const pending = (async () => {
      const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
      if (!response.ok) throw new ApiError(response.status, `No se pudo iniciar la protección de sesión (HTTP ${response.status})`);
      const body = await response.json() as { csrfToken?: string };
      if (!body.csrfToken) throw new Error('La API no devolvió el token CSRF');
      if (generation === csrfGeneration) csrfToken = body.csrfToken;
      return body.csrfToken;
    })();
    csrfTokenPromise = pending;
  }
  const pending = csrfTokenPromise;
  try { return await pending; }
  finally { if (csrfTokenPromise === pending) csrfTokenPromise = null; }
}

export function clearCsrfToken(): void {
  csrfGeneration += 1;
  csrfToken = null;
  csrfTokenPromise = null;
}

function replaceCsrfToken(token: string | null): void {
  csrfGeneration += 1;
  csrfToken = token;
  csrfTokenPromise = null;
}

function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(status: number, body: unknown): string {
  if (typeof body === 'string' && body.trim()) return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const message = body.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
      return message.join(', ');
    }
  }
  return `La API respondió con HTTP ${status}`;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', await getCsrfToken());
  const response = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers, credentials: 'same-origin' });
  if (path === '/auth/login' && response.ok) replaceCsrfToken(response.headers.get('X-CSRF-Token'));
  if (path === '/auth/logout' && response.ok) clearCsrfToken();
  if (response.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/csrf')) {
    clearCsrfToken();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth:expired'));
  }
  const body = parseBody(await response.text());
  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(response.status, body), body);
  }
  return body as T;
}
