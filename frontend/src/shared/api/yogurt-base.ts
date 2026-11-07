import { request } from './request';

export type YogurtBaseMovement = { id: number; saborId: number; sabor: string; litrosConsumidos: number; litrosObtenidos: number; diferenciaRendimiento: number; createdAt: string };
export type YogurtBaseLot = { id: number; fechaElaboracion: string; cubetas: Record<'10L' | '6L' | '4L', number>; litrosEquivalentes: number; litrosReales: number; litrosConsumidos: number; litrosRestantes: number; litrosObtenidos: number; edadCalendarioDias: number; estadoTemporal: 'PROCESADO' | 'PROCESAMIENTO_NORMAL' | 'PROCESAMIENTO_OBLIGATORIO' | 'LIMITE_EXCEDIDO_REQUIERE_REVISION'; alertaPrioritaria: boolean; requiereRevisionPorLimite: boolean; acondicionamientos: YogurtBaseMovement[] };
export type YogurtBaseOverview = { fecha: string; timezone: string; reglasPendientes: string[]; lotes: YogurtBaseLot[]; resumen: { litrosBaseDisponibles: number; litrosBaseProcesados: number; litrosAcondicionadosObtenidos: number }; saboresDestino: { id: number; nombre: string }[]; necesidadesSucursalReferencia: { saborId: number; sabor: string; capacidadLitros: number; cantidad: number; litrosReferencia: number }[] };

export const yogurtBaseApi = {
  get: (fecha: string) => request<YogurtBaseOverview>(`/yogurt-base?fecha=${encodeURIComponent(fecha)}`),
  createLot: (data: { fechaElaboracion: string; cubetas10L: number; cubetas6L: number; cubetas4L: number; litrosReales: number }) => request('/yogurt-base/lotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  condition: (data: { loteId: number; saborId: number; claveSolicitud: string; litrosConsumidos: number; litrosObtenidos: number }) => request('/yogurt-base/acondicionamientos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
};
