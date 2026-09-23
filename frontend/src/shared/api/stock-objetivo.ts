import { request } from './request';

export type StockObjetivo = {
  clienteId: number;
  saborId: number;
  presentacionId: number;
  cantidad: number;
  sabor: { id: number; nombre: string; activo: boolean };
  presentacion: { id: number; nombre: string; litrosEquivalentes: number };
  createdAt: string;
  updatedAt: string;
};

export type StockObjetivoItem = Pick<StockObjetivo, 'saborId' | 'presentacionId' | 'cantidad'>;

export const stockObjetivoApi = {
  get: (clienteId: number) => request<StockObjetivo[]>(`/clientes/${clienteId}/stock-objetivo`),
  replace: (clienteId: number, combinaciones: StockObjetivoItem[]) =>
    request<StockObjetivo[]>(`/clientes/${clienteId}/stock-objetivo`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ combinaciones }),
    }),
};
