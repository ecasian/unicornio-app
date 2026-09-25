import { request } from './request';

export type ExistenciaItem = { saborId: number; presentacionId: number; cantidad: number };

export type RegistroExistencias = {
  id: number;
  clienteId: number;
  repartidorId: number;
  createdAt: string;
  cliente: { id: number; nombre: string };
  repartidor: { id: number; nombre: string };
  detalles: (ExistenciaItem & { registroExistenciasId: number })[];
  movimiento: { id: number; tipo: 'REGISTRO_EXISTENCIAS'; createdAt: string };
};

export const existenciasApi = {
  create: (clienteId: number, repartidorId: number, existencias: ExistenciaItem[]) =>
    request<RegistroExistencias>(`/clientes/${clienteId}/registros-existencias`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repartidorId, existencias }),
    }),
  get: (clienteId: number, id: number) =>
    request<RegistroExistencias>(`/clientes/${clienteId}/registros-existencias/${id}`),
};
