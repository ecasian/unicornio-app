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
let delayedSave: Promise<Response> | null;
let saveFailure: string | null;
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

async function enter(label: string, value: string) {
  const input = [...container.querySelectorAll('input')].find((node) =>
    node.labels?.[0]?.textContent?.includes(label));
  if (!input) throw new Error(`No se encontró el campo ${label}`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
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
  return queryClient;
}

async function openCapture() {
  await renderFlow();
  await click('Seleccionar repartidor Jonathan');
  await click('Seleccionar cliente Punto Fresco');
  await click('Continuar al levantamiento');
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
  delayedSave = null;
  saveFailure = null;
  fetchMock = vi.fn(async (resource: string, init?: RequestInit) => {
    if (/\/clientes\/(3|4)\/registros-existencias$/.test(resource) && init?.method === 'POST') {
      if (delayedSave) return delayedSave;
      if (saveFailure) return json({ message: saveFailure }, 400);
      const payload = JSON.parse(String(init.body)) as { repartidorId: number; existencias: unknown[] };
      const selectedClient = clientes.find((item) => resource.endsWith(`/clientes/${item.id}/registros-existencias`))!;
      return json({ id: 19, clienteId: selectedClient.id, repartidorId: payload.repartidorId,
        cliente: { id: selectedClient.id, nombre: selectedClient.nombre }, repartidor: { id: 1, nombre: repartidor.nombre },
        createdAt: '2026-09-23T12:00:00.000Z', detalles: payload.existencias,
        movimiento: { id: 30, tipo: 'REGISTRO_EXISTENCIAS' } }, 201);
    }
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
    expect(button('Continuar al levantamiento').disabled).toBe(false);
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
    expect(button('Continuar al levantamiento').disabled).toBe(false);
  });

  it('identifica cada cliente con nombre y dirección para tecnologías de apoyo', async () => {
    await renderFlow();
    await click('Seleccionar repartidor Jonathan');
    expect(button('Seleccionar cliente Punto Fresco').getAttribute('aria-label')).toContain('Dirección: Calle Norte 12');
  });

  it('captura todas las combinaciones, incluido cero, y confirma el snapshot', async () => {
    await openCapture();
    expect(container.textContent).toContain('Stock objetivo: 0 envases');
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(2);
    await enter('Fresa · 1 litro', '0');
    await enter('Fresa · 1/2 litro', '4');
    await click('Guardar existencias');
    const post = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/clientes/3/registros-existencias') && init?.method === 'POST');
    expect(post).toBeTruthy();
    expect(JSON.parse(String(post![1].body))).toEqual({ repartidorId: 1, existencias: [
      { saborId: 7, presentacionId: 1, cantidad: 0 },
      { saborId: 7, presentacionId: 2, cantidad: 4 },
    ] });
    expect(container.textContent).toContain('Registro de existencias guardado correctamente');
    expect(container.textContent).toContain('Combinaciones registradas: 2');
    expect(container.textContent).toContain('Jonathan');
    expect(container.textContent).toContain('Punto Fresco');
  });

  it('descarta la captura de A al cambiar a B y envía solo las combinaciones de B', async () => {
    clientes.push({ ...cliente, id: 4, nombre: 'Punto Sur', direccion: 'Calle Sur 5' });
    stockB = [{ ...stockBase, clienteId: 4, saborId: 8, cantidad: 3,
      sabor: { id: 8, nombre: 'Nuez', activo: true } }];
    await openCapture();
    await enter('Fresa · 1 litro', '9');
    await enter('Fresa · 1/2 litro', '4');
    await click('← Cambiar cliente');
    await click('Seleccionar cliente Punto Sur');
    expect(container.textContent).not.toContain('Fresa');
    expect(container.textContent).toContain('Nuez');
    await click('Continuar al levantamiento');
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(1);
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('');
    expect(container.textContent).not.toContain('Fresa');
    await enter('Nuez · 1 litro', '2');
    await click('Guardar existencias');
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe('http://localhost:3000/api/clientes/4/registros-existencias');
    expect(JSON.parse(String(posts[0][1].body))).toEqual({ repartidorId: 1, existencias: [
      { saborId: 8, presentacionId: 1, cantidad: 2 },
    ] });
    expect(container.textContent).toContain('Registro de existencias guardado correctamente');
    expect(container.textContent).toContain('Punto Sur');
  });

  it('rechaza un campo vacío y una cantidad negativa antes de llamar a la API', async () => {
    await openCapture();
    await enter('Fresa · 1 litro', '0');
    await click('Guardar existencias');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('campo vacío no equivale a cero');
    await enter('Fresa · 1/2 litro', '-1');
    await click('Guardar existencias');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('entero no negativo');
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/registros-existencias') && init?.method === 'POST')).toBe(false);
  });

  it('muestra guardado en curso y error del backend sin perder las cantidades', async () => {
    await openCapture();
    await enter('Fresa · 1 litro', '3');
    await enter('Fresa · 1/2 litro', '0');
    let resolveSave!: (response: Response) => void;
    delayedSave = new Promise<Response>((resolve) => { resolveSave = resolve; });
    await click('Guardar existencias');
    expect(button('Guardando existencias…').disabled).toBe(true);
    await act(async () => { resolveSave(json({ message: 'Fallo del servidor' }, 500)); });
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Fallo del servidor');
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('3');
  });

  it('preserva la captura y bloquea el guardado si cambia el surtido remoto', async () => {
    const queryClient = await renderFlow();
    await click('Seleccionar repartidor Jonathan');
    await click('Seleccionar cliente Punto Fresco');
    await click('Continuar al levantamiento');
    await enter('Fresa · 1 litro', '5');
    stock = [stockBase];
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['surtido-operativo', 3] }); });
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('configuración del surtido cambió');
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('5');
    expect(button('Guardar existencias').disabled).toBe(true);
    await click('Recargar levantamiento');
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(0);
  });

  it('explica el conflicto del backend cuando el surtido cambió antes del POST', async () => {
    await openCapture();
    await enter('Fresa · 1 litro', '1');
    await enter('Fresa · 1/2 litro', '2');
    saveFailure = 'El surtido operativo cambió. Recarga el levantamiento antes de guardar.';
    await click('Guardar existencias');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('configuración del surtido cambió');
    expect(button('Guardar existencias').disabled).toBe(true);
  });
});
