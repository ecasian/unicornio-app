// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRouter } from '../../app/router';
import type { Cliente } from '../../shared/api/clientes';
import type { Repartidor } from '../../shared/api/repartidores';
import type { StockObjetivo } from '../../shared/api/stock-objetivo';

const repartidor: Repartidor = { id: 1, nombre: 'Jonathan', activo: true, createdAt: '', updatedAt: '' };
const cliente: Cliente = {
  id: 3, nombre: 'Punto Fresco', celular: '5551234567', direccion: 'Calle Norte 12',
  manejaMedioLitro: true, activo: true, createdAt: '', updatedAt: '',
};
const stockBase: StockObjetivo = {
  clienteId: 3, saborId: 7, presentacionId: 1, cantidad: 0,
  sabor: { id: 7, nombre: 'Fresa', activo: true },
  presentacion: { id: 1, nombre: '1 litro', litrosEquivalentes: 1 },
  createdAt: '', updatedAt: '',
};
const medioLitro: StockObjetivo = {
  ...stockBase, presentacionId: 2, cantidad: 6,
  presentacion: { id: 2, nombre: '1/2 litro', litrosEquivalentes: 0.5 },
};

let container: HTMLDivElement;
let root: Root;
let repartidores: Repartidor[];
let clientes: Cliente[];
let stock: StockObjetivo[];
let stockB: StockObjetivo[];
let fail: string | null;
let delayedStock: Promise<Response> | null;
let delayedStockB: Promise<Response> | null;
let fetchMock: ReturnType<typeof vi.fn>;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };

function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((node) =>
    (node.getAttribute('aria-label') ?? node.textContent?.trim()) === name
    || node.getAttribute('aria-label')?.startsWith(`${name}. Dirección:`));
  if (!found) throw new Error(`No se encontró el botón ${name}`);
  return found;
}

async function click(name: string) {
  await act(async () => { button(name).click(); });
  for (let index = 0; index < 3; index++) await flush();
}

async function renderFlow() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/repartidor']}><AppRouter /></MemoryRouter>
      </QueryClientProvider>,
    );
  });
  for (let index = 0; index < 3; index++) await flush();
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');
  repartidores = [repartidor];
  clientes = [cliente];
  stock = [stockBase, medioLitro];
  stockB = [];
  fail = null;
  delayedStock = null;
  delayedStockB = null;
  fetchMock = vi.fn(async (resource: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return json({ message: 'Método no permitido' }, 405);
    if (resource.endsWith('/repartidores?activo=true')) {
      return fail === 'repartidores' ? json({ message: 'Sin conexión' }, 503) : json(repartidores);
    }
    if (resource.endsWith('/clientes?activo=true')) {
      return fail === 'clientes' ? json({ message: 'Sin conexión' }, 503) : json(clientes);
    }
    if (resource.endsWith('/clientes/3/surtido-operativo')) {
      if (delayedStock) return delayedStock;
      return fail === 'stock' ? json({ message: 'Sin conexión' }, 503) : json(stock);
    }
    if (resource.endsWith('/clientes/4/surtido-operativo')) return delayedStockB ?? json(stockB);
    return json({ message: 'No encontrado' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('inicio de Repartidor', () => {
  it('muestra solo repartidores activos y mantiene la navegación separada', async () => {
    repartidores.push({ ...repartidor, id: 2, nombre: 'Inactivo', activo: false });
    await renderFlow();
    expect(container.textContent).toContain('Ruta de reparto');
    expect(button('Seleccionar repartidor Jonathan')).toBeTruthy();
    expect(container.textContent).not.toContain('Inactivo');
    expect(container.querySelector('nav[aria-label="Navegación de Administrador"]')).toBeNull();
    expect(container.textContent).not.toContain('Sucursales');
    expect(container.textContent).not.toContain('Nuevo repartidor');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/api/repartidores?activo=true');
  });

  it('selecciona repartidor y cliente activos, y muestra el surtido operativo de solo lectura', async () => {
    clientes.push({ ...cliente, id: 4, nombre: 'Tienda inactiva', activo: false });
    await renderFlow();
    await click('Seleccionar repartidor Jonathan');
    expect(container.textContent).toContain('Selecciona el cliente');
    expect(document.activeElement?.id).toBe('seleccionar-cliente');
    expect(container.textContent).toContain('5551234567');
    expect(container.textContent).toContain('Calle Norte 12');
    expect(container.textContent).not.toContain('Tienda inactiva');
    expect(fetchMock.mock.calls.some(([url]) => url === 'http://localhost:3000/api/clientes?activo=true')).toBe(true);
    await click('Seleccionar cliente Punto Fresco');
    expect(fetchMock.mock.calls.some(([url]) => url === 'http://localhost:3000/api/clientes/3/surtido-operativo')).toBe(true);
    expect(document.activeElement?.id).toBe('resumen-surtido');
    expect(container.textContent).toContain('Surtido de Punto Fresco');
    expect(container.textContent).toContain('Fresa');
    expect(container.textContent).toContain('1 litro');
    expect(container.textContent).toContain('1/2 litro');
    expect(container.textContent).toContain('0 envases');
    expect(container.textContent).toContain('6 envases');
    expect(button('Continuar al levantamiento').disabled).toBe(true);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/sabores/'))).toBe(false);
  });

  it('bloquea el levantamiento cuando el cliente no tiene surtido', async () => {
    stock = [];
    await renderFlow();
    await click('Seleccionar repartidor Jonathan');
    await click('Seleccionar cliente Punto Fresco');
    expect(container.textContent).toContain('Sin surtido operativo');
    expect(container.textContent).toContain('No puede iniciarse el levantamiento');
    expect(button('Continuar al levantamiento').disabled).toBe(true);
  });

  it('muestra loading mientras consulta el stock del cliente', async () => {
    let resolveStock!: (response: Response) => void;
    delayedStock = new Promise<Response>((resolve) => { resolveStock = resolve; });
    await renderFlow();
    await click('Seleccionar repartidor Jonathan');
    await click('Seleccionar cliente Punto Fresco');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Cargando surtido');
    await act(async () => { resolveStock(json(stock)); });
    for (let index = 0; index < 3; index++) await flush();
    expect(container.textContent).toContain('Fresa');
  });

  it('muestra loading y permite reintentar errores de la API', async () => {
    let resolveRepartidores!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRepartidores = resolve; }));
    await renderFlow();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Cargando repartidores');
    await act(async () => { resolveRepartidores(json(repartidores)); });
    await flush();
    fail = 'clientes';
    await click('Seleccionar repartidor Jonathan');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Sin conexión');
    fail = null;
    await click('Reintentar');
    expect(button('Seleccionar cliente Punto Fresco')).toBeTruthy();
  });

  it('muestra loading del surtido y recupera un error sin perder las selecciones', async () => {
    fail = 'stock';
    await renderFlow();
    await click('Seleccionar repartidor Jonathan');
    await click('Seleccionar cliente Punto Fresco');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Sin conexión');
    fail = null;
    await click('Reintentar');
    expect(container.textContent).toContain('Surtido de Punto Fresco');
    expect(container.textContent).toContain('Fresa');
  });

  it('conserva el repartidor al cambiar cliente y limpia ambos al volver al inicio', async () => {
    await renderFlow();
    await click('Seleccionar repartidor Jonathan');
    await click('Seleccionar cliente Punto Fresco');
    await click('← Cambiar cliente');
    expect(container.textContent).toContain('Repartidor: Jonathan');
    expect(button('Seleccionar cliente Punto Fresco')).toBeTruthy();
    await click('← Cambiar repartidor');
    expect(button('Seleccionar repartidor Jonathan')).toBeTruthy();
    expect(container.textContent).not.toContain('Selecciona el cliente');
  });

  it('no muestra el surtido de A mientras carga el surtido de B', async () => {
    clientes.push({ ...cliente, id: 4, nombre: 'Punto Sur', direccion: 'Calle Sur 5' });
    stockB = [{ ...stockBase, clienteId: 4, saborId: 8, cantidad: 3,
      sabor: { id: 8, nombre: 'Nuez', activo: true } }];
    let resolveB!: (response: Response) => void;
    delayedStockB = new Promise<Response>((resolve) => { resolveB = resolve; });
    await renderFlow();
    await click('Seleccionar repartidor Jonathan');
    await click('Seleccionar cliente Punto Fresco');
    expect(container.textContent).toContain('Fresa');
    await click('← Cambiar cliente');
    await click('Seleccionar cliente Punto Sur');
    expect(container.textContent).toContain('Surtido de Punto Sur');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Cargando surtido');
    expect(container.textContent).not.toContain('Fresa');
    await act(async () => { resolveB(json(stockB)); });
    await flush();
    expect(container.textContent).toContain('Nuez');
    expect(container.textContent).not.toContain('Fresa');
    expect(fetchMock.mock.calls.some(([url]) => url === 'http://localhost:3000/api/clientes/4/surtido-operativo')).toBe(true);
  });

  it('considera surtido configurado cuando todas las cantidades son cero', async () => {
    stock = [stockBase, { ...medioLitro, cantidad: 0 }];
    await renderFlow();
    await click('Seleccionar repartidor Jonathan');
    await click('Seleccionar cliente Punto Fresco');
    expect(container.textContent).not.toContain('Sin surtido operativo');
    expect(container.textContent).toContain('1 litro');
    expect(container.textContent).toContain('1/2 litro');
    expect(container.textContent?.match(/0 envases/g)).toHaveLength(2);
    expect(button('Continuar al levantamiento').disabled).toBe(true);
  });

  it('identifica cada cliente con nombre y dirección para tecnologías de apoyo', async () => {
    await renderFlow();
    await click('Seleccionar repartidor Jonathan');
    expect(button('Seleccionar cliente Punto Fresco').getAttribute('aria-label')).toContain('Dirección: Calle Norte 12');
  });
});
