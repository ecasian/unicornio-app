import { URL } from 'node:url';

const DATABASE_NAME = 'auth_rbac_audit_test';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function parseAuthTestDatabaseUrl(value) {
  if (typeof value !== 'string' || !value) throw new Error('DATABASE_URL debe apuntar a la base local auth_rbac_audit_test.');
  let url;
  try { url = new URL(value); } catch { throw new Error('DATABASE_URL no es una URL PostgreSQL válida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) ||
      url.pathname !== `/${DATABASE_NAME}` || url.search || url.hash) {
    throw new Error('Destino rechazado: solo se permite auth_rbac_audit_test en PostgreSQL loopback, sin parámetros adicionales.');
  }
  return url;
}

export function parseAuthSmokeOrigin(value) {
  if (typeof value !== 'string' || !value) throw new Error('AUTH_SMOKE_ORIGIN debe ser un origen HTTP(S) local exacto.');
  let url;
  try { url = new URL(value); } catch { throw new Error('AUTH_SMOKE_ORIGIN no es una URL válida.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.origin !== value) {
    throw new Error('Destino rechazado: AUTH_SMOKE_ORIGIN debe ser un origen HTTP(S) exacto de loopback, sin credenciales ni ruta.');
  }
  return url.origin;
}
