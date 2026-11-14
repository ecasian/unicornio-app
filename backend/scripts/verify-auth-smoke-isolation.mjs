import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import process from 'node:process';
import { once } from 'node:events';
import { clearTimeout as clearTimer, setTimeout as setTimer } from 'node:timers';
import { fileURLToPath, URL } from 'node:url';
import { parseAuthTestDatabaseUrl } from './safe-local-auth-target.mjs';

const databaseUrl = process.env.DATABASE_URL;
parseAuthTestDatabaseUrl(databaseUrl);
const backendDir = fileURLToPath(new URL('../', import.meta.url));
const smokeScript = fileURLToPath(new URL('./smoke-auth-http.mjs', import.meta.url));
let requests = 0;
let smoke;
let timeout;
const existingLocalServer = createServer((_request, response) => {
  requests += 1;
  response.writeHead(200).end('This endpoint must not be used by the smoke.');
});

try {
  await new Promise((resolve, reject) => {
    existingLocalServer.once('error', reject);
    existingLocalServer.listen(0, '127.0.0.1', resolve);
  });
  const address = existingLocalServer.address();
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1') throw new Error('Sentinel server did not bind to loopback.');
  const existingOrigin = `http://127.0.0.1:${address.port}`;
  smoke = spawn(process.execPath, [smokeScript], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: databaseUrl, AUTH_SMOKE_ORIGIN: existingOrigin },
    stdio: 'inherit',
  });
  timeout = setTimer(() => smoke.kill('SIGKILL'), 120_000);
  const [code, signal] = await once(smoke, 'exit');
  clearTimer(timeout);
  timeout = undefined;
  if (code !== 0) throw new Error(`Auth HTTP smoke falló (${code ?? signal ?? 'sin código'}).`);
  if (requests !== 0) throw new Error(`El smoke envió ${requests} solicitud(es) al servidor local preexistente.`);
  process.stdout.write('PASS: servidor local preexistente recibió cero solicitudes.\n');
} finally {
  clearTimer(timeout);
  if (smoke && smoke.exitCode === null && smoke.signalCode === null) {
    smoke.kill('SIGKILL');
    await once(smoke, 'exit').catch(() => undefined);
  }
  await new Promise((resolve) => existingLocalServer.close(() => resolve()));
}
