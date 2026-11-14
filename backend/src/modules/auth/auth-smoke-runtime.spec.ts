import { createServer } from 'node:http';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { startControlledBackend, startLocalViteProxy, stopLocalViteProxy } from '../../../scripts/auth-smoke-runtime.mjs';

const servers: ReturnType<typeof createServer>[] = [];
const proxies: Array<{ server: Awaited<ReturnType<typeof startLocalViteProxy>>['server'] }> = [];
const previousSmokeOrigin = process.env.AUTH_SMOKE_ORIGIN;

afterEach(async () => {
  if (previousSmokeOrigin === undefined) delete process.env.AUTH_SMOKE_ORIGIN;
  else process.env.AUTH_SMOKE_ORIGIN = previousSmokeOrigin;
  for (const proxy of proxies.splice(0)) await stopLocalViteProxy(proxy);
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function listenLoopback(server: ReturnType<typeof createServer>) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  return `http://127.0.0.1:${address.port}`;
}

describe('auth smoke process ownership', () => {
  it('rejects an invalid database before spawning a child', async () => {
    let spawned = false;
    await expect(startControlledBackend({
      databaseUrl: 'postgresql://u:p@remote.example/auth_rbac_audit_test',
      publicOrigin: 'http://127.0.0.1:4173',
      onChild: () => { spawned = true; },
    })).rejects.toThrow();
    expect(spawned).toBe(false);
  });

  it('reaps its child when Backend startup fails', async () => {
    let child: import('node:child_process').ChildProcess | undefined;
    const missingEntry = fileURLToPath(new URL('../../../scripts/__missing_auth_smoke_entry__.mjs', import.meta.url));
    await expect(startControlledBackend({
      databaseUrl: 'postgresql://u:p@127.0.0.1:5432/auth_rbac_audit_test',
      publicOrigin: 'http://127.0.0.1:4173',
      entry: missingEntry,
      timeoutMs: 5_000,
      onChild: (created) => { child = created; },
    })).rejects.toThrow(/terminó antes de estar listo|No se pudo iniciar/);
    expect(child).toBeDefined();
    expect(child?.exitCode !== null || child?.signalCode !== null).toBe(true);
  });

  it('routes the local proxy to its controlled Backend and never to an existing local origin', async () => {
    let controlledRequests = 0;
    let existingOriginRequests = 0;
    const controlledBackend = createServer((_request, response) => {
      controlledRequests += 1;
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}');
    });
    const existingOrigin = createServer((_request, response) => {
      existingOriginRequests += 1;
      response.writeHead(200).end('unexpected');
    });
    const backendOrigin = await listenLoopback(controlledBackend);
    const existingOriginUrl = await listenLoopback(existingOrigin);
    process.env.AUTH_SMOKE_ORIGIN = existingOriginUrl;
    const portServer = createServer();
    servers.push(portServer);
    await new Promise<void>((resolve) => portServer.listen(0, '127.0.0.1', resolve));
    const proxyPort = (portServer.address() as import('node:net').AddressInfo).port;
    await new Promise<void>((resolve) => portServer.close(() => resolve()));

    const proxy = await startLocalViteProxy({ backendOrigin, port: proxyPort });
    proxies.push({ server: proxy.server });
    const response = await fetch(`${proxy.origin}/api/health`, { redirect: 'manual' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(controlledRequests).toBe(1);
    expect(existingOriginRequests).toBe(0);
    delete process.env.AUTH_SMOKE_ORIGIN;
  });
});
