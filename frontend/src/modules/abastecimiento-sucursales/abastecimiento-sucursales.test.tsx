// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AbastecimientoSucursalesPage } from './AbastecimientoSucursalesPage';

let container: HTMLDivElement;
let root: Root;
let responseBody: unknown;
let responseStatus: number;
let calls: string[];
const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  calls = [];
  responseStatus = 200;
  responseBody = {
    fecha: '2026-11-10', timezone: 'America/Mexico_City',
    sucursales: [
      { sucursalId: 1, sucursal: 'Centro', sucursalActiva: true, estado: 'APROBADA', version: 2, propuestaId: 101, confirmadoAt: '2026-11-10T18:00:00.000Z', detalle: [
        { saborId: 1, sabor: 'Fresa', saborActivo: true, litrosDecididos: '7.125' },
        { saborId: 2, sabor: 'Nuez', saborActivo: true, litrosDecididos: '0' },
        { saborId: 3, sabor: 'Natural', saborActivo: true, litrosDecididos: null },
      ] },
      { sucursalId: 2, sucursal: 'Villa', sucursalActiva: false, estado: 'PENDIENTE', version: 3, propuestaId: 102, confirmadoAt: null, detalle: [{ saborId: 1, sabor: 'Fresa', saborActivo: true, litrosDecididos: null }] },
      { sucursalId: 3, sucursal: 'Colibrí', sucursalActiva: true, estado: 'REQUIERE_REVISION', version: 1, propuestaId: 103, confirmadoAt: '2026-11-10T18:00:00.000Z', detalle: [{ saborId: 1, sabor: 'Fresa', saborActivo: true, litrosDecididos: null }] },
      { sucursalId: 4, sucursal: 'Carranza', sucursalActiva: true, estado: 'SIN_PROPUESTA', version: null, propuestaId: null, confirmadoAt: null, detalle: [] },
    ],
    consolidadoPorSabor: [{ saborId: 1, sabor: 'Fresa', saborActivo: true, litrosDecididos: '7.125' }, { saborId: 2, sabor: 'Nuez', saborActivo: true, litrosDecididos: '0' }],
    totalLitrosAprobados: '7.125', conteos: { aprobadas: 1, pendientes: 1, requiereRevision: 1, sinPropuesta: 1 },
    alertas: [{ tipo: 'BORRADOR', sucursalId: 2, sucursal: 'Villa', propuestaId: 102, version: 3, mensaje: 'Continúa en borrador.' }, { tipo: 'OBSOLESCENCIA', sucursalId: 3, sucursal: 'Colibrí', propuestaId: 103, version: 1, mensaje: 'Requiere revisión.' }],
  };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    return new Response(JSON.stringify(responseBody), { status: responseStatus, headers: { 'Content-Type': 'application/json' } });
  }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});

afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><AbastecimientoSucursalesPage /></MemoryRouter></QueryClientProvider>));
}

describe('Consolidado de abastecimiento aprobado', () => {
  it('shows latest approved amounts, distinctions, alerts, and proposal links without treating totals as production', async () => {
    await render();
    expect(container.textContent).toContain('Cargando consolidado');
    await flush();
    expect(calls[0]).toBe('/api/abastecimiento-sucursales/resumen');
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-11-10');
    expect(container.textContent).toContain('Aprobadas vigentes');
    expect(container.textContent).toContain('7.125 L');
    expect(container.textContent).toContain('0 L');
    expect(container.textContent).toContain('No contabilizada');
    expect(container.textContent).toContain('inactiva (histórico)');
    expect(container.textContent).toContain('No existe propuesta para esta fecha.');
    expect(container.textContent).toContain('no representan producción fabricada');
    const link = container.querySelector('a[href*="propuestaId=101"]') as HTMLAnchorElement;
    expect(link.textContent).toBe('Abrir propuesta');
    expect(link.getAttribute('href')).toContain('fecha=2026-11-10');
    expect(container.querySelectorAll('a[href*="propuestaId="]')).toHaveLength(5);
  });

  it('shows a clear API error and supports an empty result', async () => {
    responseStatus = 503;
    responseBody = { message: 'Servicio no disponible' };
    await render(); await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Servicio no disponible');

    await act(async () => root.unmount());
    root = createRoot(container);
    responseStatus = 200;
    responseBody = { fecha: '2026-11-10', timezone: 'America/Mexico_City', sucursales: [], consolidadoPorSabor: [], totalLitrosAprobados: '0', conteos: { aprobadas: 0, pendientes: 0, requiereRevision: 0, sinPropuesta: 0 }, alertas: [] };
    await render(); await flush();
    expect(container.textContent).toContain('No hay sucursales registradas para consultar.');
    expect(container.textContent).toContain('No hay cantidades aprobadas para consolidar.');
  });
});
