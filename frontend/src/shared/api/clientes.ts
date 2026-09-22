import { request } from './request';

export type Cliente = {
  id: number;
  nombre: string;
  celular: string;
  direccion: string;
  manejaMedioLitro: boolean;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClienteInput = Pick<Cliente, 'nombre' | 'celular' | 'direccion' | 'manejaMedioLitro'>;
export type ClienteUpdate = Partial<ClienteInput & Pick<Cliente, 'activo'>>;

export const clientesApi = {
  list: () => request<Cliente[]>('/clientes'),
  get: (id: number) => request<Cliente>(`/clientes/${id}`),
  create: (data: ClienteInput) => request<Cliente>('/clientes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  update: (id: number, data: ClienteUpdate) => request<Cliente>(`/clientes/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
};
