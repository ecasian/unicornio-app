import { request } from './request';

export type Repartidor = {
  id: number;
  nombre: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RepartidorInput = Pick<Repartidor, 'nombre'>;
export type RepartidorUpdate = Partial<Pick<Repartidor, 'nombre' | 'activo'>>;

export const repartidoresApi = {
  list: () => request<Repartidor[]>('/repartidores'),
  listActive: () => request<Repartidor[]>('/repartidores?activo=true'),
  get: (id: number) => request<Repartidor>(`/repartidores/${id}`),
  create: (data: RepartidorInput) => request<Repartidor>('/repartidores', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  update: (id: number, data: RepartidorUpdate) => request<Repartidor>(`/repartidores/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
};
