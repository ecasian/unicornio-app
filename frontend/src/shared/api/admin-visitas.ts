import { request } from './request';

export type AdminVisita = {
  id: number;
  llegadaAt: string;
  cliente: { id: number; nombre: string };
  repartidor: { id: number; nombre: string };
};

export type AdminVisitasResponse = {
  fecha: string;
  timezone: string;
  filtros: { clienteId: number | null; repartidorId: number | null };
  visitas: AdminVisita[];
};

export type AdminVisitasFilters = {
  fecha?: string;
  clienteId?: number;
  repartidorId?: number;
};

export const adminVisitasApi = {
  list: (filters: AdminVisitasFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.fecha) params.set('fecha', filters.fecha);
    if (filters.clienteId !== undefined) params.set('clienteId', String(filters.clienteId));
    if (filters.repartidorId !== undefined) params.set('repartidorId', String(filters.repartidorId));
    const query = params.toString();
    return request<AdminVisitasResponse>(`/admin/visitas${query ? `?${query}` : ''}`);
  },
};
