import { request } from './request';

export type InventarioCatalogos = {
  fecha: string;
  timezone: string;
  sucursales: { id: number; nombre: string; horarios: Record<TurnoInventario, string> | null }[];
  sabores: { id: number; nombre: string }[];
};

export type TurnoInventario = 'MATUTINO' | 'VESPERTINO';
export type InventarioDetalle = { saborId: number; sabor: string; litros: string };
export type InventarioReporte = {
  id: number;
  sucursalId: number;
  sucursal?: string;
  sucursalActiva?: boolean;
  turno: TurnoInventario | null;
  fecha: string;
  estado: 'BORRADOR' | 'CONFIRMADO';
  confirmadoAt: string | null;
  createdAt: string;
  updatedAt: string;
  detalles: InventarioDetalle[];
};

export type InventarioResumen = {
  fecha: string;
  turno: TurnoInventario;
  timezone: string;
  sucursalesPendientes: { id: number; nombre: string; activo: boolean }[];
  sucursales: InventarioReporte[];
  consolidado: { saborId: number; sabor: string; litros: string }[];
  ultimoInventarioConfirmadoPorSucursal: { sucursalId: number; sucursal: string; activo: boolean; reporte: InventarioReporte | null }[];
  historicosAnterioresSinTurno: { sucursalId: number; sucursal: string; reporte: InventarioReporte }[];
};

export const inventarioSucursalesApi = {
  captureCatalogs: () => request<InventarioCatalogos>('/inventario-sucursales/captura'),
  getReport: (sucursalId: number, fecha: string, turno: TurnoInventario) => request<{ fecha: string; turno: TurnoInventario; reporte: InventarioReporte | null }>(`/inventario-sucursales/reporte?sucursalId=${sucursalId}&fecha=${encodeURIComponent(fecha)}&turno=${turno}`),
  saveReport: (data: { fecha: string; sucursalId: number; turno: TurnoInventario; detalles: { saborId: number; litros: string }[] }) => request<InventarioReporte>('/inventario-sucursales/reportes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  confirmReport: (id: number) => request<InventarioReporte>(`/inventario-sucursales/reportes/${id}/confirmacion`, { method: 'POST' }),
  getSummary: (turno: TurnoInventario, fecha?: string) => request<InventarioResumen>(`/inventario-sucursales?turno=${turno}${fecha ? `&fecha=${encodeURIComponent(fecha)}` : ''}`),
};
