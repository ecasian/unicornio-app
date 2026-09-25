import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';

// Estos IDs y el dominio público fueron verificados para unicornio-app/staging.
// Si Railway cambia el dominio o recrea el environment, revisar el destino antes de actualizar esta lista.
const target = Object.freeze({
  projectId: 'af070c45-ff88-4f9d-ab9b-d133048a657d',
  environmentId: '3fa12d72-4bf7-4f3a-b490-b21666b6afc2',
  api: 'https://backend-staging-f866.up.railway.app/api',
});

const repartidoresDemo = ['Carlos Demo', 'Ana Demo'];
const clientesDemo = [
  { nombre: 'Tienda Centro Demo', celular: '0000000001', direccion: 'Calle Ficticia 100, Centro Demo', manejaMedioLitro: true },
  { nombre: 'Tienda Norte Demo', celular: '0000000002', direccion: 'Avenida Imaginaria 200, Norte Demo', manejaMedioLitro: false },
  { nombre: 'Tienda Sin Stock Demo', celular: '0000000003', direccion: 'Pasaje Inventado 300, Zona Demo', manejaMedioLitro: true },
];
const saboresDemo = [
  { nombre: 'Fresa Demo', litro: true, medio: true },
  { nombre: 'Nuez Demo', litro: true, medio: true },
  { nombre: 'Ciruela Demo', litro: true, medio: false },
];
const stockDemo = new Map([
  ['Tienda Centro Demo', [
    ['Fresa Demo', '1 litro', 10], ['Fresa Demo', '1/2 litro', 0],
    ['Nuez Demo', '1 litro', 8], ['Nuez Demo', '1/2 litro', 4],
    ['Ciruela Demo', '1 litro', 6],
  ]],
  ['Tienda Norte Demo', [
    ['Fresa Demo', '1 litro', 6], ['Nuez Demo', '1 litro', 5], ['Ciruela Demo', '1 litro', 3],
  ]],
  ['Tienda Sin Stock Demo', []],
]);

function verifyTarget() {
  const url = new URL(target.api);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'backend-staging-f866.up.railway.app');
  assert.equal(url.pathname, '/api');
  assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME ?? 'staging', 'staging', 'No ejecutar fuera de staging');
  if (process.env.RAILWAY_PROJECT_ID) assert.equal(process.env.RAILWAY_PROJECT_ID, target.projectId, 'Proyecto Railway inesperado');
  if (process.env.RAILWAY_ENVIRONMENT_ID) assert.equal(process.env.RAILWAY_ENVIRONMENT_ID, target.environmentId, 'Environment Railway inesperado');
  assert.deepEqual(process.argv.slice(2), [], 'Este script no acepta un destino alternativo');
}

async function api(path, method = 'GET', body) {
  const response = await globalThis.fetch(`${target.api}${path}`, {
    method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: globalThis.AbortSignal.timeout(30000),
  });
  const content = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${content.slice(0, 300)}`);
  return content ? JSON.parse(content) : undefined;
}

function uniqueByName(rows, name) {
  const matches = rows.filter((row) => row.nombre === name);
  assert.ok(matches.length <= 1, `Nombre demo duplicado antes de la carga: ${name}`);
  return matches[0];
}

function stockKey(sabor, presentacion) { return `${sabor}|${presentacion}`; }

async function preflight() {
  const [health, repartidores, clientes, sabores, presentaciones] = await Promise.all([
    api('/health'), api('/repartidores'), api('/clientes'), api('/sabores'), api('/presentaciones'),
  ]);
  assert.equal(health.status, 'ok', 'Backend de staging no saludable');
  for (const rows of [repartidores, clientes, sabores, presentaciones]) assert.ok(Array.isArray(rows), 'Catálogo inesperado');
  assert.equal(presentaciones.length, 2, 'Staging debe tener exactamente dos presentaciones');
  assert.deepEqual(new Map(presentaciones.map((row) => [row.nombre, row.litrosEquivalentes])),
    new Map([['1 litro', 1], ['1/2 litro', 0.5]]));
  for (const name of repartidoresDemo) uniqueByName(repartidores, name);
  for (const spec of clientesDemo) uniqueByName(clientes, spec.nombre);
  for (const spec of saboresDemo) uniqueByName(sabores, spec.nombre);

  // Un PUT de StockObjetivo reemplaza todo el surtido: abortar si borraría una fila ajena al plan.
  for (const spec of clientesDemo) {
    const found = uniqueByName(clientes, spec.nombre);
    if (!found) continue;
    const current = await api(`/clientes/${found.id}/stock-objetivo`);
    const allowed = new Set(stockDemo.get(spec.nombre).map(([sabor, presentation]) => stockKey(sabor, presentation)));
    for (const row of current) {
      assert.ok(allowed.has(stockKey(row.sabor.nombre, row.presentacion.nombre)),
        `El cliente ${spec.nombre} tiene stock ajeno al plan demo; no se eliminará`);
    }
  }
  return { repartidores, clientes, sabores, presentaciones };
}

async function ensureCatalog(rows, name, path, createBody, updateBody, tally) {
  const current = uniqueByName(rows, name);
  if (!current) {
    const created = await api(path, 'POST', createBody);
    rows.push(created);
    tally.created++;
    return created;
  }
  const changed = Object.fromEntries(Object.entries(updateBody).filter(([field, value]) => current[field] !== value));
  if (Object.keys(changed).length === 0) { tally.unchanged++; return current; }
  const updated = await api(`${path}/${current.id}`, 'PATCH', changed);
  Object.assign(current, updated);
  tally.updated++;
  return updated;
}

function sameStock(current, desired) {
  if (current.length !== desired.length) return false;
  const amounts = new Map(current.map((row) => [`${row.saborId}:${row.presentacionId}`, row.cantidad]));
  return desired.every((row) => amounts.get(`${row.saborId}:${row.presentacionId}`) === row.cantidad);
}

async function run() {
  verifyTarget();
  const state = await preflight();
  const tally = { created: 0, updated: 0, unchanged: 0, relationsUpdated: 0, stockUpdated: 0 };
  const ids = { clientes: new Map(), sabores: new Map() };

  for (const nombre of repartidoresDemo) {
    await ensureCatalog(state.repartidores, nombre, '/repartidores', { nombre }, { activo: true }, tally);
  }
  for (const spec of clientesDemo) {
    const row = await ensureCatalog(state.clientes, spec.nombre, '/clientes', spec,
      { celular: spec.celular, direccion: spec.direccion, manejaMedioLitro: spec.manejaMedioLitro, activo: true }, tally);
    ids.clientes.set(spec.nombre, row.id);
  }
  for (const spec of saboresDemo) {
    const row = await ensureCatalog(state.sabores, spec.nombre, '/sabores', { nombre: spec.nombre }, { activo: true }, tally);
    ids.sabores.set(spec.nombre, row.id);
  }

  const presentationIds = new Map(state.presentaciones.map((row) => [row.nombre, row.id]));
  for (const spec of saboresDemo) {
    const saborId = ids.sabores.get(spec.nombre);
    const desired = [
      { presentacionId: presentationIds.get('1 litro'), habilitada: spec.litro },
      { presentacionId: presentationIds.get('1/2 litro'), habilitada: spec.medio },
    ];
    const current = await api(`/sabores/${saborId}/presentaciones`);
    if (desired.some((row) => current.find((item) => item.presentacionId === row.presentacionId)?.habilitada !== row.habilitada)) {
      await api(`/sabores/${saborId}/presentaciones`, 'PUT', { presentaciones: desired });
      tally.relationsUpdated++;
    }
  }

  for (const spec of clientesDemo) {
    const clienteId = ids.clientes.get(spec.nombre);
    const desired = stockDemo.get(spec.nombre).map(([sabor, presentation, cantidad]) => ({
      saborId: ids.sabores.get(sabor), presentacionId: presentationIds.get(presentation), cantidad,
    }));
    const current = await api(`/clientes/${clienteId}/stock-objetivo`);
    if (!sameStock(current, desired)) {
      await api(`/clientes/${clienteId}/stock-objetivo`, 'PUT', { combinaciones: desired });
      tally.stockUpdated++;
    }
  }

  const [repartidores, clientes, sabores] = await Promise.all([
    api('/repartidores'), api('/clientes'), api('/sabores'),
  ]);
  for (const name of repartidoresDemo) assert.equal(repartidores.filter((row) => row.nombre === name && row.activo).length, 1);
  for (const spec of clientesDemo) assert.equal(clientes.filter((row) => row.nombre === spec.nombre && row.activo).length, 1);
  for (const spec of saboresDemo) assert.equal(sabores.filter((row) => row.nombre === spec.nombre && row.activo).length, 1);
  for (const spec of clientesDemo) {
    const rows = await api(`/clientes/${ids.clientes.get(spec.nombre)}/stock-objetivo`);
    const desired = stockDemo.get(spec.nombre).map(([sabor, presentation, cantidad]) => ({
      saborId: ids.sabores.get(sabor), presentacionId: presentationIds.get(presentation), cantidad,
    }));
    assert.ok(sameStock(rows, desired), `StockObjetivo inesperado para ${spec.nombre}`);
  }
  console.log(JSON.stringify({ target: 'unicornio-app/staging', tally, demo: {
    repartidores: repartidoresDemo.length, clientes: clientesDemo.length, sabores: saboresDemo.length,
    presentacionesExistentes: state.presentaciones.length, stockObjetivo: 8,
  } }));
}

run().catch((error) => { console.error(error.message); process.exitCode = 1; });
