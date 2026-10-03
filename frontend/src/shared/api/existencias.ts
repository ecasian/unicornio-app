import { request } from './request';

export type ExistenciaItem = { saborId: number; presentacionId: number; cantidad: number };

export type DetallePedido = {
  pedidoProduccionId: number;
  saborId: number;
  presentacionId: number;
  cantidadSugerida: number;
  cantidadSolicitada: number;
  sabor: { id: number; nombre: string };
  presentacion: { id: number; nombre: string };
};

export type RegistroExistencias = {
  id: number;
  clienteId: number;
  repartidorId: number;
  visitaClienteId: number | null;
  createdAt: string;
  cliente: { id: number; nombre: string };
  repartidor: { id: number; nombre: string };
  detalles: (ExistenciaItem & { registroExistenciasId: number })[];
  movimiento: { id: number; tipo: 'REGISTRO_EXISTENCIAS'; createdAt: string };
  requiereProduccion: boolean;
  pedidoProduccion: {
    id: number;
    clienteId: number;
    repartidorId: number;
    registroExistenciasId: number;
    createdAt: string;
    detalles: DetallePedido[];
    movimiento: { id: number; tipo: 'PEDIDO_PRODUCCION'; createdAt: string };
  } | null;
};

export const existenciasApi = {
  create: (clienteId: number, repartidorId: number, visitaClienteId: number, existencias: ExistenciaItem[]) =>
    request<RegistroExistencias>(`/clientes/${clienteId}/registros-existencias`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repartidorId, visitaClienteId, existencias }),
    }),
  get: (clienteId: number, id: number) =>
    request<RegistroExistencias>(`/clientes/${clienteId}/registros-existencias/${id}`),
};
