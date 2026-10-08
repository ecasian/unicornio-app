import { request } from './request';

export type ProduccionDetalle = {
  saborId: number;
  sabor: string;
  presentacionId: number;
  presentacion: string;
  cantidad: number;
};

export type ProduccionPedido = {
  pedidoProduccionId: number;
  registroExistenciasId: number;
  visitaClienteId: number;
  llegadaAt: string;
  repartidorId: number;
  repartidor: string;
  detalles: ProduccionDetalle[];
};

export type ProduccionTienda = { clienteId: number; cliente: string; pedidos: ProduccionPedido[] };

export type ProduccionDia = {
  fecha: string;
  timezone: string;
  tiendas: ProduccionTienda[];
  consolidado: ProduccionDetalle[];
};

export const produccionApi = {
  get: (fecha?: string) => request<ProduccionDia>(`/produccion${fecha ? `?fecha=${encodeURIComponent(fecha)}` : ''}`),
};
