import { fork } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import process from 'node:process';
import { clearTimeout as clearTimer, setTimeout as setTimer } from 'node:timers';
import { fileURLToPath, URL } from 'node:url';
import { createServer as createViteServer } from '../../frontend/node_modules/vite/dist/node/index.js';
import { parseAuthSmokeOrigin, parseAuthTestDatabaseUrl } from './safe-local-auth-target.mjs';

const LOOPBACK = '127.0.0.1';
const backendEntry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const frontendRoot = fileURLToPath(new URL('../../frontend/', import.meta.url));
const frontendConfig = fileURLToPath(new URL('../../frontend/vite.config.ts', import.meta.url));

export async function reserveLoopbackPort() {
  const server = createTcpServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK, resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    let killTimer;
    let finishTimer;
    const finish = () => {
      clearTimer(killTimer);
      clearTimer(finishTimer);
      resolve();
    };
    child.once('exit', () => {
      finish();
    });
    killTimer = setTimer(() => {
      child.kill('SIGKILL');
      finishTimer = setTimer(finish, 2_000);
    }, 1_500);
    child.kill();
  });
}

export async function startControlledBackend({ databaseUrl, publicOrigin, timeoutMs = 20_000, entry = backendEntry, onChild }) {
  parseAuthTestDatabaseUrl(databaseUrl);
  parseAuthSmokeOrigin(publicOrigin);
  const child = fork(entry, [], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PUBLIC_ORIGIN: publicOrigin,
      PORT: '0',
      BACKEND_HOST: LOOPBACK,
      AUTH_SMOKE_CONTROLLED: '1',
    },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  try {
    onChild?.(child);
    const ready = await new Promise((resolve, reject) => {
      const timer = setTimer(() => reject(new Error('Backend controlado excedió el tiempo de arranque.')), timeoutMs);
      const finish = (callback, value) => {
        clearTimer(timer);
        child.removeListener('message', onMessage);
        child.removeListener('exit', onExit);
        child.removeListener('error', onError);
        callback(value);
      };
      const onMessage = (message) => finish(resolve, message);
      const onExit = (code, signal) => finish(reject, new Error(`Backend controlado terminó antes de estar listo (${code ?? signal ?? 'sin código'}).`));
      const onError = () => finish(reject, new Error('No se pudo iniciar el Backend controlado.'));
      child.once('message', onMessage);
      child.once('exit', onExit);
      child.once('error', onError);
    });
    if (ready?.type !== 'auth-smoke-ready' || ready.host !== LOOPBACK || !Number.isInteger(ready.port) || ready.port < 1 || ready.port > 65535) {
      throw new Error('Backend controlado anunció una dirección no loopback o inválida.');
    }
    return { child, host: ready.host, port: ready.port, origin: `http://${LOOPBACK}:${ready.port}` };
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}

export async function stopControlledBackend(backend) {
  if (backend?.child) await stopChild(backend.child);
}

export async function startLocalViteProxy({ backendOrigin, port }) {
  const backend = new URL(backendOrigin);
  if (backend.protocol !== 'http:' || backend.hostname !== LOOPBACK || backend.pathname !== '/' ||
      backend.username || backend.password || backend.search || backend.hash || backend.origin !== backendOrigin) {
    throw new Error('El proxy del smoke solo puede apuntar al Backend loopback controlado.');
  }
  const previousTarget = process.env.API_PROXY_TARGET;
  process.env.API_PROXY_TARGET = backendOrigin;
  let server;
  try {
    server = await createViteServer({
      root: frontendRoot,
      configFile: frontendConfig,
      server: { host: LOOPBACK, port, strictPort: true },
    });
  } finally {
    if (previousTarget === undefined) delete process.env.API_PROXY_TARGET;
    else process.env.API_PROXY_TARGET = previousTarget;
  }
  try {
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string' || address.address !== LOOPBACK || address.port !== port) {
      throw new Error('El proxy local no quedó escuchando en el loopback y puerto seleccionados.');
    }
    const origin = parseAuthSmokeOrigin(`http://${LOOPBACK}:${address.port}`);
    return { server, origin, port: address.port };
  } catch (error) {
    await server.close();
    throw error;
  }
}

export async function stopLocalViteProxy(proxy) {
  if (proxy?.server) await proxy.server.close();
}
