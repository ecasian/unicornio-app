import { request } from './request';

export type Sucursal = { id: number; nombre: string; activo: boolean; createdAt: string; updatedAt: string };
export type NecesidadDetalle = { saborId: number; capacidadLitros: 4 | 6 | 10; cantidad: number };
export type ReporteSucursal = { sucursalId: number; sucursal: string; estado: 'CONFIRMADO'; confirmadoAt: string; detalles: (NecesidadDetalle & { sabor: string; litrosEquivalentes: number })[] };
export type Consolidado = { fecha: string; timezone: string; sucursalesSinConfirmar: Pick<Sucursal, 'id' | 'nombre' | 'activo'>[]; sucursales: ReporteSucursal[]; consolidado: (NecesidadDetalle & { sabor: string; litrosEquivalentes: number })[] };

export const sucursalesApi = {
  list: () => request<Sucursal[]>('/sucursales'),
  listSabores: () => request<{ id: number; nombre: string }[]>('/sucursales/sabores'),
  create: (nombre: string) => request<Sucursal>('/sucursales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre }) }),
  update: (id: number, data: Partial<Pick<Sucursal, 'nombre' | 'activo'>>) => request<Sucursal>(`/sucursales/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  save: (id: number, fecha: string, detalles: NecesidadDetalle[]) => request(`/sucursales/${id}/necesidades`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fecha, detalles }) }),
  confirm: (id: number, fecha: string) => request(`/sucursales/${id}/necesidades/confirmacion?fecha=${encodeURIComponent(fecha)}`, { method: 'POST' }),
  report: (fecha?: string) => request<Consolidado>(`/concentrado-sucursales${fecha ? `?fecha=${encodeURIComponent(fecha)}` : ''}`),
};
