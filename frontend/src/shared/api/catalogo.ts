import { request } from './request';

export type Sabor = {
  id: number;
  nombre: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Presentacion = {
  id: number;
  nombre: string;
  litrosEquivalentes: number;
  createdAt: string;
  updatedAt: string;
};

export type SaborPresentacion = {
  presentacionId: number;
  nombre: string;
  litrosEquivalentes: number;
  habilitada: boolean;
};

export type SaborInput = Pick<Sabor, 'nombre'>;
export type SaborUpdate = Partial<Pick<Sabor, 'nombre' | 'activo'>>;
export type PresentacionState = Pick<SaborPresentacion, 'presentacionId' | 'habilitada'>;

export const catalogoApi = {
  listSabores: () => request<Sabor[]>('/sabores'),
  getSabor: (id: number) => request<Sabor>(`/sabores/${id}`),
  createSabor: (data: SaborInput) => request<Sabor>('/sabores', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  updateSabor: (id: number, data: SaborUpdate) => request<Sabor>(`/sabores/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  listPresentaciones: () => request<Presentacion[]>('/presentaciones'),
  getSaborPresentaciones: (id: number) => request<SaborPresentacion[]>(`/sabores/${id}/presentaciones`),
  replaceSaborPresentaciones: (id: number, presentaciones: PresentacionState[]) =>
    request<SaborPresentacion[]>(`/sabores/${id}/presentaciones`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentaciones }),
    }),
};
