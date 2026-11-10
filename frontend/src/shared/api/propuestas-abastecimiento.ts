import { request } from './request';

export type PropuestaAbastecimiento = {
  id: number; sucursalId: number; sucursal: { id: number; nombre: string; activo: boolean };
  fecha: string; timezone: string; version: number; estado: 'BORRADOR' | 'CONFIRMADA'; obsoleta: boolean;
  fuente: { reporteId: number | null; fecha: string | null; turno: 'VESPERTINO' | null; confirmadoAt: string | null };
  creadaAt: string; confirmadaAt: string | null;
  detalles: { saborId: number; sabor: string; saborActivo: boolean; estadoReferencia: 'DISPONIBLE' | 'SIN_DATOS'; objetivoLitros: string | null; objetivoActualizadoAt: string | null; existenciaLitros: string | null; sugerenciaLitros: string | null; decisionLitros: string | null }[];
};

export const propuestasAbastecimientoApi = {
  list: (fecha: string) => request<{ timezone: string; propuestas: PropuestaAbastecimiento[] }>(`/propuestas-abastecimiento?fecha=${encodeURIComponent(fecha)}`),
  get: (id: number) => request<PropuestaAbastecimiento>(`/propuestas-abastecimiento/${id}`),
  create: (sucursalId: number, fecha: string) => request<PropuestaAbastecimiento>('/propuestas-abastecimiento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sucursalId, fecha }) }),
  decisions: (id: number, decisiones: { saborId: number; decisionLitros: string | null }[]) => request<PropuestaAbastecimiento>(`/propuestas-abastecimiento/${id}/decisiones`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decisiones }) }),
  recalculate: (id: number) => request<PropuestaAbastecimiento>(`/propuestas-abastecimiento/${id}/recalcular`, { method: 'POST' }),
  confirm: (id: number) => request<PropuestaAbastecimiento>(`/propuestas-abastecimiento/${id}/confirmacion`, { method: 'POST' }),
};
