import { request } from './request';

export type EstadoAbastecimientoSucursal = 'APROBADA' | 'PENDIENTE' | 'REQUIERE_REVISION' | 'SIN_PROPUESTA';

export type AbastecimientoSucursalesResumen = {
  fecha: string;
  timezone: string;
  sucursales: {
    sucursalId: number;
    sucursal: string;
    sucursalActiva: boolean;
    estado: EstadoAbastecimientoSucursal;
    version: number | null;
    propuestaId: number | null;
    confirmadoAt: string | null;
    detalle: { saborId: number; sabor: string; saborActivo: boolean; litrosDecididos: string | null }[];
  }[];
  consolidadoPorSabor: { saborId: number; sabor: string; saborActivo: boolean; litrosDecididos: string }[];
  totalLitrosAprobados: string;
  conteos: { aprobadas: number; pendientes: number; requiereRevision: number; sinPropuesta: number };
  alertas: { tipo: 'BORRADOR' | 'OBSOLESCENCIA'; sucursalId: number; sucursal: string; propuestaId: number; version: number; mensaje: string }[];
};

export const abastecimientoSucursalesApi = {
  resumen: (fecha?: string) => request<AbastecimientoSucursalesResumen>(`/abastecimiento-sucursales/resumen${fecha ? `?fecha=${encodeURIComponent(fecha)}` : ''}`),
};
