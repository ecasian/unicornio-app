import { request } from './request';

export type VisitaCliente = {
  id: number;
  clienteId: number;
  repartidorId: number;
  llegadaAt: string;
};

export const visitasApi = {
  create: (clienteId: number, repartidorId: number) =>
    request<VisitaCliente>(`/clientes/${clienteId}/visitas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repartidorId }),
    }),
};
