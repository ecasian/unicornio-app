import { request } from './request';

export type AuthUser = {
  id: number;
  email: string;
  nombre: string;
  repartidorId: number | null;
  roles: string[];
  permissions: string[];
};

export type InternalUser = {
  id: number;
  nombre: string;
  email: string;
  activo: boolean;
  repartidorId: number | null;
  roles: { rol: { codigo: string; nombre: string } }[];
};

export type AuditEvent = {
  id: string;
  actorUsuarioId: number | null;
  accion: string;
  ruta: string;
  metodo: string;
  resultado: string;
  requestId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: { id: number; nombre: string; email: string } | null;
};

export const authApi = {
  session: () => request<AuthUser>('/auth/session'),
  login: (email: string, password: string) => request<{ user: AuthUser }>('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  users: () => request<InternalUser[]>('/auth/users'),
  audit: () => request<AuditEvent[]>('/auth/audit'),
  roles: () => request<Array<{ codigo: string; nombre: string }>>('/auth/roles'),
  activeCouriers: () => request<Array<{ id: number; nombre: string; activo: boolean }>>('/repartidores?activo=true'),
  createUser: (input: { nombre: string; email: string; password: string; roles: string[]; repartidorId?: number }) => request('/auth/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  setActive: (id: number, activo: boolean) => request(`/auth/users/${id}/active`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo }),
  }),
  setRoles: (id: number, roles: string[]) => request(`/auth/users/${id}/roles`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roles }),
  }),
  resetPassword: (id: number, password: string) => request(`/auth/users/${id}/password`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
  }),
};
