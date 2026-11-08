import { request } from './request';
import type { TurnoInventario } from './inventario-sucursales';

export type ObjetivoSucursal = {
  saborId: number;
  sabor: string;
  saborActivo: boolean;
  litros: string;
  createdAt: string;
  updatedAt: string;
};

export type StockObjetivoSucursalResponse = {
  sucursal: { id: number; nombre: string; activo: boolean };
  objetivos: ObjetivoSucursal[];
};

export type ComparacionStockSucursal = {
  sucursal: { id: number; nombre: string; activo: boolean };
  fecha: string;
  timezone: string;
  turno: TurnoInventario;
  inventarioEstado: 'AUSENTE' | 'BORRADOR' | 'CONFIRMADO';
  inventarioId: number | null;
  comparaciones: {
    saborId: number;
    sabor: string;
    saborActivo: boolean;
    objetivoConfigurado: boolean;
    objetivoLitros: string | null;
    existenciaRegistrada: boolean;
    existenciaLitros: string | null;
    diferenciaLitros: string | null;
  }[];
};

export const stockObjetivoSucursalesApi = {
  get: (sucursalId: number) => request<StockObjetivoSucursalResponse>(`/sucursales/${sucursalId}/stock-objetivo`),
  replace: (sucursalId: number, objetivos: { saborId: number; litros: string }[]) => request<StockObjetivoSucursalResponse>(`/sucursales/${sucursalId}/stock-objetivo`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objetivos }) }),
  compare: (sucursalId: number, fecha: string, turno: TurnoInventario) => request<ComparacionStockSucursal>(`/sucursales/${sucursalId}/stock-objetivo/comparacion?fecha=${encodeURIComponent(fecha)}&turno=${turno}`),
};
