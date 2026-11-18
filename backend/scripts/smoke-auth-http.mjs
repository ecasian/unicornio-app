import { createHash, randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../dist/modules/auth/password-hasher.js';
import { parseAuthTestDatabaseUrl } from './safe-local-auth-target.mjs';
import { reserveLoopbackPort, startControlledBackend, startLocalViteProxy, stopControlledBackend, stopLocalViteProxy } from './auth-smoke-runtime.mjs';

const databaseUrl = process.env.DATABASE_URL;
parseAuthTestDatabaseUrl(databaseUrl);
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const suffix = randomUUID().slice(0, 12);
const username = `http-smoke-${suffix}`;
const password = randomBytes(24).toString('base64url');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const cookiePairs = (headers) => headers.flatMap((header) => header.split(/, (?=[^;,]+=)/)).map((header) => header.split(';', 1)[0]);
const cookieHeader = (pairs) => pairs.join('; ');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const fetchLocal = async (input, init = {}) => {
  check(origin, 'El proxy local del smoke todavÃ­a no estÃ¡ iniciado.');
  const response = await globalThis.fetch(input, { ...init, redirect: 'manual' });
  check(response.status < 300 || response.status >= 400, `El smoke rechazÃ³ una redirecciÃ³n HTTP (${response.status}).`);
  return response;
};
let origin;
let sessionCookieName;
let csrfCookieName;
let backend;
let proxy;
const startCsrfSession = async () => {
  const response = await fetchLocal(`${origin}/api/auth/csrf`);
  const body = await response.json();
  const cookies = cookiePairs(response.headers.getSetCookie());
  const sessionPair = cookies.find((pair) => pair.startsWith(`${sessionCookieName}=`));
  check(response.status === 200 && body.csrfToken && sessionPair, `No se pudo iniciar la sesiÃ³n CSRF (HTTP ${response.status}).`);
  anonymousTokenHashes.push(sha256(decodeURIComponent(sessionPair.slice(sessionCookieName.length + 1))));
  return { body, cookies };
};
const loginUser = async (identifier, loginPassword) => {
  const csrf = await startCsrfSession();
  const response = await fetchLocal(`${origin}/api/auth/login`, {
    method: 'POST', headers: { Origin: origin, Cookie: cookieHeader(csrf.cookies), 'X-CSRF-Token': csrf.body.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: identifier, password: loginPassword }),
  });
  check(response.status === 200, `Login de prueba devolviÃ³ HTTP ${response.status}.`);
  const cookies = cookiePairs(response.headers.getSetCookie());
  const sessionPair = cookies.find((pair) => pair.startsWith(`${sessionCookieName}=`));
  check(sessionPair, 'Login no devolviÃ³ cookie de sesiÃ³n.');
  authenticatedTokenHashes.push(sha256(decodeURIComponent(sessionPair.slice(sessionCookieName.length + 1))));
  return { cookies, cookie: cookieHeader(cookies) };
};

let userId;
let adminUserId;
let managedUserId;
const extraUserIds = [];
const demoCourierIds = [];
const anonymousTokenHashes = [];
const authenticatedTokenHashes = [];
try {
  const [{ current_database: database }] = await prisma.$queryRaw`SELECT current_database()`;
  check(database === 'auth_rbac_audit_test', `Base inesperada: ${database}`);
  const proxyPort = await reserveLoopbackPort();
  const publicOrigin = `http://127.0.0.1:${proxyPort}`;
  backend = await startControlledBackend({ databaseUrl, publicOrigin });
  proxy = await startLocalViteProxy({ backendOrigin: backend.origin, port: proxyPort });
  origin = proxy.origin;
  sessionCookieName = origin.startsWith('https://') ? '__Host-unicornio_session' : 'unicornio_session';
  csrfCookieName = origin.startsWith('https://') ? '__Host-unicornio_csrf' : 'unicornio_csrf';
  const health = await fetchLocal(`${origin}/api/health`);
  check(!health.redirected && health.status === 200 && health.headers.get('content-type')?.includes('application/json'), 'Health no fue JSON HTTP 200 local, sin redirecciÃ³n.');
  const preflightCsrf = await fetchLocal(`${origin}/api/auth/csrf`);
  check(!preflightCsrf.redirected && preflightCsrf.status === 200, 'No se pudo comprobar el Backend local antes de crear fixtures.');
  const preflightCookie = cookiePairs(preflightCsrf.headers.getSetCookie()).find((pair) => pair.startsWith('unicornio_session=') || pair.startsWith('__Host-unicornio_session='));
  check(preflightCookie, 'El Backend no devolviÃ³ una sesiÃ³n local verificable.');
  const preflightTokenHash = sha256(decodeURIComponent(preflightCookie.slice(preflightCookie.indexOf('=') + 1)));
  const sameDatabaseSession = await prisma.sesion.findUnique({ where: { tokenHash: preflightTokenHash }, select: { id: true } });
  check(Boolean(sameDatabaseSession), 'El Backend local no usa la misma base auth_rbac_audit_test; se aborta antes de crear fixtures.');
  anonymousTokenHashes.push(preflightTokenHash);
  const role = await prisma.rol.findUnique({ where: { codigo: 'OPERADOR_PRODUCCION' } });
  check(Boolean(role), 'Falta el rol de prueba OPERADOR_PRODUCCION.');
  const user = await prisma.usuarioInterno.create({ data: {
    nombre: 'Auth HTTP Smoke', username, email: `${username}@example.invalid`, passwordHash: await hashPassword(password),
    roles: { create: { rolId: role.id } },
  } });
  userId = user.id;
  await loginUser(user.email, password);

  check(!health.headers.get('access-control-allow-origin'), 'La API devolviÃ³ CORS abierto en el contrato same-origin.');
  const deepRoute = await fetchLocal(`${origin}/produccion/base`);
  check(deepRoute.status === 200 && deepRoute.headers.get('content-type')?.includes('text/html'), 'La ruta SPA profunda no devolviÃ³ el fallback HTML.');

  const csrfResponse = await fetchLocal(`${origin}/api/auth/csrf`);
  check(csrfResponse.status === 200, `No se pudo crear la sesiÃ³n CSRF previa al login (HTTP ${csrfResponse.status}).`);
  const csrfData = await csrfResponse.json();
  const anonymousCookies = cookiePairs(csrfResponse.headers.getSetCookie());
  const sessionPair = anonymousCookies.find((pair) => pair.startsWith('unicornio_session=') || pair.startsWith('__Host-unicornio_session='));
  const csrfPair = anonymousCookies.find((pair) => pair.startsWith('unicornio_csrf=') || pair.startsWith('__Host-unicornio_csrf='));
  check(sessionPair && csrfPair && csrfData.csrfToken, 'El proxy no conservÃ³ ambas cookies o el token CSRF.');
  check(sessionCookieName === sessionPair.split('=', 1)[0], 'El nombre de cookie de sesiÃ³n no coincide con el esquema local/HTTPS.');
  const cookieAttributes = csrfResponse.headers.getSetCookie().find((header) => header.startsWith(`${sessionCookieName}=`)) ?? '';
  check(/HttpOnly/i.test(cookieAttributes) && /SameSite=Lax/i.test(cookieAttributes) && /Path=\//i.test(cookieAttributes) && !/Domain=/i.test(cookieAttributes), 'La cookie de sesiÃ³n no es host-only, HttpOnly, Path=/ y SameSite=Lax.');
  if (origin.startsWith('https://')) check(/Secure/i.test(cookieAttributes), 'La cookie de sesiÃ³n no tiene Secure bajo HTTPS.');
  const anonymousToken = decodeURIComponent(sessionPair.slice(sessionCookieName.length + 1));
  anonymousTokenHashes.push(sha256(anonymousToken));

  const wrongOrigin = await fetchLocal(`${origin}/api/auth/login`, {
    method: 'POST', headers: { Origin: 'https://attacker.invalid', Cookie: cookieHeader(anonymousCookies), 'X-CSRF-Token': csrfData.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  check(wrongOrigin.status === 403, 'Se permitiÃ³ Origin que no coincide.');
  const missingCsrf = await fetchLocal(`${origin}/api/auth/login`, {
    method: 'POST', headers: { Origin: origin, Cookie: cookieHeader(anonymousCookies), 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  check(missingCsrf.status === 403, 'Se permitiÃ³ login sin CSRF.');
  const badLogin = await fetchLocal(`${origin}/api/auth/login`, {
    method: 'POST', headers: { Origin: origin, Cookie: cookieHeader(anonymousCookies), 'X-CSRF-Token': csrfData.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: randomBytes(24).toString('base64url') }),
  });
  check(badLogin.status === 401, 'Un login incorrecto no devolviÃ³ 401 genÃ©rico.');
  const badLoginId = badLogin.headers.get('x-request-id');
  const badLoginAudit = await prisma.eventoAuditoria.findFirst({ where: { requestId: badLoginId, accion: 'AUTH_LOGIN_FAILED', resultado: 'DENIED' } });
  check(Boolean(badLoginAudit) && !JSON.stringify(badLoginAudit.metadata).match(/password|cookie|token|hash/i), 'El login fallido no quedÃ³ auditado de forma segura.');

  const login = await fetchLocal(`${origin}/api/auth/login`, {
    method: 'POST', headers: { Origin: origin, Cookie: cookieHeader(anonymousCookies), 'X-CSRF-Token': csrfData.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  check(login.status === 200, `Login devolviÃ³ HTTP ${login.status}.`);
  const loginBody = await login.json();
  check(loginBody.user?.username === username && !('passwordHash' in loginBody.user), 'La respuesta de login no es el perfil pÃºblico esperado.');
  const loginCookies = cookiePairs(login.headers.getSetCookie());
  const csrfAfterLogin = login.headers.get('x-csrf-token');
  const loggedInSession = loginCookies.find((pair) => pair.startsWith(`${sessionCookieName}=`));
  check(loggedInSession && csrfAfterLogin, 'Login no rotÃ³ sesiÃ³n ni token CSRF.');
  const loggedToken = decodeURIComponent(loggedInSession.slice(sessionCookieName.length + 1));
  authenticatedTokenHashes.push(sha256(loggedToken));
  const loggedCookieHeader = cookieHeader(loginCookies);

  const current = await fetchLocal(`${origin}/api/auth/session`, { headers: { Cookie: loggedCookieHeader } });
  check(current.status === 200 && (await current.json()).id === userId, 'SesiÃ³n autenticada no se pudo consultar.');
  const expiredSessionToken = randomBytes(32).toString('base64url');
  await prisma.sesion.create({ data: { tokenHash: sha256(expiredSessionToken), csrfHash: sha256(randomBytes(32).toString('base64url')), usuarioId: userId, expiresAt: new Date(Date.now() - 1000) } });
  authenticatedTokenHashes.push(sha256(expiredSessionToken));
  const expiredSession = await fetchLocal(`${origin}/api/auth/session`, { headers: { Cookie: `${sessionCookieName}=${expiredSessionToken}` } });
  check(expiredSession.status === 401, 'Una sesiÃ³n expirada conservÃ³ acceso.');
  const denied = await fetchLocal(`${origin}/api/auth/users`, { headers: { Cookie: loggedCookieHeader } });
  check(denied.status === 403, 'OPERADOR_PRODUCCION obtuvo acceso a administraciÃ³n de usuarios.');

  const logout = await fetchLocal(`${origin}/api/auth/logout`, {
    method: 'POST', headers: { Origin: origin, Cookie: loggedCookieHeader, 'X-CSRF-Token': csrfAfterLogin },
  });
  check(logout.status === 200, `Logout devolviÃ³ HTTP ${logout.status}.`);
  const afterLogout = await fetchLocal(`${origin}/api/auth/session`, { headers: { Cookie: loggedCookieHeader } });
  check(afterLogout.status === 401, 'La sesiÃ³n siguiÃ³ vigente despuÃ©s del logout.');

  const adminRole = await prisma.rol.findUnique({ where: { codigo: 'ADMIN_GENERAL' } });
  check(Boolean(adminRole), 'Falta ADMIN_GENERAL para probar la administraciÃ³n de usuarios.');
  const adminPassword = randomBytes(24).toString('base64url');
  const admin = await prisma.usuarioInterno.create({ data: {
    nombre: 'Auth Admin HTTP Smoke', username: `admin-${suffix}`, passwordHash: await hashPassword(adminPassword),
    roles: { create: { rolId: adminRole.id } },
  } });
  adminUserId = admin.id;
  const adminLogin = await loginUser(admin.username, adminPassword);
  const adminCookieHeader = adminLogin.cookie;
  const adminCsrfToken = adminLogin.cookies.find((pair) => pair.startsWith(`${csrfCookieName}=`))?.split('=', 2)[1];

  const userList = await fetchLocal(`${origin}/api/auth/users`, { headers: { Cookie: adminCookieHeader } });
  const roleList = await fetchLocal(`${origin}/api/auth/roles`, { headers: { Cookie: adminCookieHeader } });
  const auditList = await fetchLocal(`${origin}/api/auth/audit?take=10`, { headers: { Cookie: adminCookieHeader } });
  const swagger = await fetchLocal(`${origin}/api/docs`);
  check(userList.status === 200 && roleList.status === 200 && auditList.status === 200, 'ADMIN_GENERAL no pudo consultar usuarios, roles y auditorÃ­a.');
  check(swagger.status === 200, 'Swagger local no estÃ¡ disponible para revisiÃ³n.');
  const adminCsrfHeaders = { Origin: origin, Cookie: adminCookieHeader, 'X-CSRF-Token': adminCsrfToken, 'Content-Type': 'application/json' };
  const createCourier = async (name) => {
    const response = await fetchLocal(`${origin}/api/repartidores`, { method: 'POST', headers: adminCsrfHeaders, body: JSON.stringify({ nombre: name }) });
    check(response.status === 201, `ADMIN_GENERAL no pudo crear fixture Repartidor (HTTP ${response.status}).`);
    const courier = await response.json();
    demoCourierIds.push(courier.id);
    return courier.id;
  };
  const courierId = await createCourier(`Auth Smoke ${suffix.slice(0, 8)} A`);
  const otherCourierId = await createCourier(`Auth Smoke ${suffix.slice(0, 8)} B`);
  const createProfile = async (name, roleCodes, repartidorId) => {
    const profilePassword = randomBytes(24).toString('base64url');
    const profileUsername = `${name.toLowerCase().replaceAll('_', '-')}-${suffix}`;
    const response = await fetchLocal(`${origin}/api/auth/users`, {
      method: 'POST', headers: adminCsrfHeaders,
      body: JSON.stringify({ nombre: `Auth Smoke ${name}`, username: profileUsername, password: profilePassword, roles: roleCodes, ...(repartidorId ? { repartidorId } : {}) }),
    });
    check(response.status === 201, `ADMIN_GENERAL no pudo crear el perfil ${name} (HTTP ${response.status}).`);
    const account = await response.json();
    extraUserIds.push(account.id);
    const requestId = response.headers.get('x-request-id');
    check(requestId, `La creaciÃ³n de ${name} no devolviÃ³ requestId del servidor.`);
    const correlated = await prisma.eventoAuditoria.findMany({ where: { requestId }, select: { accion: true, actorUsuarioId: true, metadata: true } });
    check(correlated.some((event) => event.accion === 'USER_CREATED' && event.actorUsuarioId === admin.id), `USER_CREATED de ${name} no quedÃ³ correlacionado con el actor real.`);
    check(correlated.some((event) => event.accion === 'MUTATION_REQUESTED') && correlated.some((event) => event.accion === 'MUTATION_SUCCEEDED'), `La solicitud de creaciÃ³n de ${name} no tiene ciclo REQUESTED/SUCCEEDED.`);
    check(correlated.every((event) => !JSON.stringify(event.metadata).match(/password|cookie|token|hash/i)), `La auditorÃ­a de ${name} filtrÃ³ metadatos sensibles.`);
    const session = await loginUser(profileUsername, profilePassword);
    const sessionResponse = await fetchLocal(`${origin}/api/auth/session`, { headers: { Cookie: session.cookie } });
    check(sessionResponse.status === 200, `El perfil ${name} no pudo iniciar sesiÃ³n.`);
    const publicProfile = await sessionResponse.json();
    check(publicProfile.roles.length === roleCodes.length && roleCodes.every((code) => publicProfile.roles.includes(code)), `El perfil ${name} no conserva los roles solicitados.`);
    check(!JSON.stringify(publicProfile).match(/password|hash/i), `La sesiÃ³n de ${name} expuso credenciales o hash.`);
    return { account, session, publicProfile };
  };
  const branchAdmin = await createProfile('ADMIN_SUCURSALES', ['ADMIN_SUCURSALES']);
  const productionOperator = await createProfile('OPERADOR_PRODUCCION', ['OPERADOR_PRODUCCION']);
  const courierProfile = await createProfile('REPARTIDOR', ['REPARTIDOR'], courierId);
  const multiProfile = await createProfile('MULTI_ROLE', ['ADMIN_SUCURSALES', 'OPERADOR_PRODUCCION']);
  const branchAllowed = await fetchLocal(`${origin}/api/sucursales`, { headers: { Cookie: branchAdmin.session.cookie } });
  const branchDenied = await fetchLocal(`${origin}/api/auth/users`, { headers: { Cookie: branchAdmin.session.cookie } });
  check(branchAllowed.status === 200 && branchDenied.status === 403, 'ADMIN_SUCURSALES no respetÃ³ la separaciÃ³n de permisos.');
  const productionAllowed = await fetchLocal(`${origin}/api/yogurt-base?fecha=${new Date().toISOString().slice(0, 10)}`, { headers: { Cookie: productionOperator.session.cookie } });
  const productionDenied = await fetchLocal(`${origin}/api/clientes`, { headers: { Cookie: productionOperator.session.cookie } });
  check(productionAllowed.status === 200 && productionDenied.status === 403, `OPERADOR_PRODUCCION no respetÃ³ la separaciÃ³n de permisos (permitido ${productionAllowed.status}, restringido ${productionDenied.status}).`);
  const multiBranch = await fetchLocal(`${origin}/api/sucursales`, { headers: { Cookie: multiProfile.session.cookie } });
  const multiProduction = await fetchLocal(`${origin}/api/yogurt-base?fecha=${new Date().toISOString().slice(0, 10)}`, { headers: { Cookie: multiProfile.session.cookie } });
  check(multiBranch.status === 200 && multiProduction.status === 200, 'Los permisos de roles mÃºltiples no se combinaron.');
  const courierListResponse = await fetchLocal(`${origin}/api/repartidores`, { headers: { Cookie: courierProfile.session.cookie } });
  const courierList = await courierListResponse.json();
  check(courierListResponse.status === 200 && courierList.length === 1 && courierList[0].id === courierId, 'REPARTIDOR pudo listar identidades fuera de su asociaciÃ³n.');
  const courierIdor = await fetchLocal(`${origin}/api/repartidores/${otherCourierId}`, { headers: { Cookie: courierProfile.session.cookie } });
  check(courierIdor.status === 403, 'REPARTIDOR pudo consultar otra identidad.');
  const courierCsrf = courierProfile.session.cookies.find((pair) => pair.startsWith(`${csrfCookieName}=`))?.split('=', 2)[1];
  const spoofedCourierVisit = await fetchLocal(`${origin}/api/clientes/1/visitas`, {
    method: 'POST', headers: { Origin: origin, Cookie: courierProfile.session.cookie, 'X-CSRF-Token': courierCsrf, 'Content-Type': 'application/json' },
    body: JSON.stringify({ repartidorId: otherCourierId }),
  });
  check(spoofedCourierVisit.status === 403, 'REPARTIDOR pudo suplantar otra identidad en una visita.');
  const invalidBusinessRequest = await fetchLocal(`${origin}/api/yogurt-base/lotes`, {
    method: 'POST', headers: { Origin: origin, Cookie: productionOperator.session.cookie, 'X-CSRF-Token': productionOperator.session.cookies.find((pair) => pair.startsWith(`${csrfCookieName}=`))?.split('=', 2)[1], 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  check(invalidBusinessRequest.status === 400, 'La validaciÃ³n de negocio no rechazÃ³ el payload incompleto.');
  const invalidRequestId = invalidBusinessRequest.headers.get('x-request-id');
  const invalidAudit = await prisma.eventoAuditoria.findMany({ where: { requestId: invalidRequestId }, select: { accion: true, resultado: true, actorUsuarioId: true, metadata: true } });
  check(invalidAudit.some((event) => event.accion === 'MUTATION_FAILED' && event.resultado === 'FAILED' && event.actorUsuarioId === productionOperator.account.id), 'El fallo de validaciÃ³n no quedÃ³ auditado con el actor autenticado.');
  check(invalidAudit.every((event) => !JSON.stringify(event.metadata).match(/password|cookie|token|hash/i)), 'La auditorÃ­a del fallo de negocio filtrÃ³ secretos.');
  const managedPassword = randomBytes(9).toString('base64url');
  const createAttempt = (body) => fetchLocal(`${origin}/api/auth/users`, {
    method: 'POST', headers: adminCsrfHeaders, body: JSON.stringify(body),
  });
  const sample = { nombre: 'Managed Auth Test', username: `managed-${suffix}`, password: managedPassword, roles: ['OPERADOR_PRODUCCION'] };
  check((await createAttempt({ ...sample, password: managedPassword.slice(1) })).status === 400, 'Alta aceptó 11 caracteres.');
  check((await createAttempt({ ...sample, roles: ['REPARTIDOR'], repartidorId: courierId })).status === 409, 'Ficha duplicada sin 409.');
  const createManaged = await fetchLocal(`${origin}/api/auth/users`, {
    method: 'POST', headers: { Origin: origin, Cookie: adminCookieHeader, 'X-CSRF-Token': adminCsrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Managed Auth Test', username: `managed-${suffix}`, password: managedPassword, roles: ['OPERADOR_PRODUCCION'] }),
  });
  check(createManaged.status === 201, `ADMIN_GENERAL no pudo crear usuario (HTTP ${createManaged.status}).`);
  managedUserId = (await createManaged.json()).id;
  check((await createAttempt({ ...sample, username: ' ' + sample.username.toUpperCase() + ' ' })).status === 409, 'Usuario duplicado sin 409.');
  const managedUsername = `managed-${suffix}`;
  const beforeRoleChange = await loginUser(managedUsername, managedPassword);
  const managedBeforeRoleChange = await fetchLocal(`${origin}/api/auth/session`, { headers: { Cookie: beforeRoleChange.cookie } });
  check(managedBeforeRoleChange.status === 200, 'La nueva cuenta no iniciÃ³ sesiÃ³n antes de cambiar roles.');
  const roleUpdate = await fetchLocal(`${origin}/api/auth/users/${managedUserId}/roles`, {
    method: 'PUT', headers: { Origin: origin, Cookie: adminCookieHeader, 'X-CSRF-Token': adminCsrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles: ['ADMIN_SUCURSALES'] }),
  });
  check(roleUpdate.status === 200, 'El cambio de roles no pudo guardarse.');
  const revokedByRoleChange = await fetchLocal(`${origin}/api/auth/session`, { headers: { Cookie: beforeRoleChange.cookie } });
  check(revokedByRoleChange.status === 401, 'El cambio de roles dejÃ³ vigente la sesiÃ³n anterior.');
  const afterRoleChange = await loginUser(managedUsername, managedPassword);
  const managedAfterRoleChange = await fetchLocal(`${origin}/api/auth/session`, { headers: { Cookie: afterRoleChange.cookie } });
  check(managedAfterRoleChange.status === 200, 'El usuario no pudo iniciar una sesiÃ³n con el rol actualizado.');
  const deniedAfterRoleChange = await fetchLocal(`${origin}/api/auth/users`, { headers: { Cookie: afterRoleChange.cookie } });
  check(deniedAfterRoleChange.status === 403, 'ADMIN_SUCURSALES obtuvo permisos de administraciÃ³n general.');
  const replacementPassword = randomBytes(24).toString('base64url');
  const passwordReset = await fetchLocal(`${origin}/api/auth/users/${managedUserId}/password`, {
    method: 'PATCH', headers: { Origin: origin, Cookie: adminCookieHeader, 'X-CSRF-Token': adminCsrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: replacementPassword }),
  });
  check(passwordReset.status === 200, 'El restablecimiento de contraseÃ±a fallÃ³.');
  const revokedByPasswordReset = await fetchLocal(`${origin}/api/auth/session`, { headers: { Cookie: afterRoleChange.cookie } });
  check(revokedByPasswordReset.status === 401, 'El restablecimiento de contraseÃ±a dejÃ³ vigente una sesiÃ³n anterior.');
  const deactivateManaged = await fetchLocal(`${origin}/api/auth/users/${managedUserId}/active`, {
    method: 'PATCH', headers: { Origin: origin, Cookie: adminCookieHeader, 'X-CSRF-Token': adminCsrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ activo: false }),
  });
  check(deactivateManaged.status === 200, 'No se pudo desactivar al usuario de prueba.');
  const activeAdminsBeforeDeactivation = await prisma.usuarioInterno.count({ where: { activo: true, roles: { some: { rol: { codigo: 'ADMIN_GENERAL' } } } } });
  const deactivateLastAdmin = await fetchLocal(`${origin}/api/auth/users/${adminUserId}/active`, {
    method: 'PATCH', headers: { Origin: origin, Cookie: adminCookieHeader, 'X-CSRF-Token': adminCsrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ activo: false }),
  });
  check(deactivateLastAdmin.status === (activeAdminsBeforeDeactivation === 1 ? 409 : 200), 'La protecciÃ³n de Ãºltimo administrador no coincide con la cantidad de admins activos.');
  if (activeAdminsBeforeDeactivation === 1) {
    const adminLogout = await fetchLocal(`${origin}/api/auth/logout`, {
      method: 'POST', headers: { Origin: origin, Cookie: adminCookieHeader, 'X-CSRF-Token': adminCsrfToken },
    });
    check(adminLogout.status === 200, 'No se pudo cerrar la sesiÃ³n administradora de prueba.');
  } else {
    const revokedAdminSession = await fetchLocal(`${origin}/api/auth/session`, { headers: { Cookie: adminCookieHeader } });
    check(revokedAdminSession.status === 401, 'Desactivar la cuenta no revocÃ³ su sesiÃ³n.');
  }

  const rateCsrfResponse = await fetchLocal(`${origin}/api/auth/csrf`);
  const rateCsrfBody = await rateCsrfResponse.json();
  const rateCookies = cookiePairs(rateCsrfResponse.headers.getSetCookie());
  const rateSessionPair = rateCookies.find((pair) => pair.startsWith(`${sessionCookieName}=`));
  check(rateCsrfResponse.status === 200 && rateCsrfBody.csrfToken && rateSessionPair, 'No se pudo preparar la verificaciÃ³n de rate limit.');
  anonymousTokenHashes.push(sha256(decodeURIComponent(rateSessionPair.slice(sessionCookieName.length + 1))));
  const rateAttempts = [];
  for (let attempt = 0; attempt < 11; attempt++) {
    rateAttempts.push(await fetchLocal(`${origin}/api/auth/login`, {
      method: 'POST', headers: { Origin: origin, Cookie: cookieHeader(rateCookies), 'X-CSRF-Token': rateCsrfBody.csrfToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: attempt % 2 ? user.email : username, password: password + "x" }),
    }));
  }
  check(rateAttempts.slice(0, 10).every((response) => response.status === 401), 'Las credenciales errÃ³neas no conservaron respuesta genÃ©rica 401 en los primeros diez intentos.');
  check(rateAttempts[10].status === 429, 'El lÃ­mite de intentos no bloqueÃ³ el intento nÃºmero once.');
  process.stdout.write(`PASS: health por proxy, SPA fallback, cookies, Origin/CSRF, login/logout, 401/403/429, revocaciÃ³n, administraciÃ³n de usuarios/roles y protecciÃ³n del Ãºltimo admin. Backend ${backend.origin}; Vite ${origin}.\n`);
} finally {
  try {
    const userIds = [userId, adminUserId, managedUserId, ...extraUserIds].filter(Boolean);
    if (userIds.length) {
      await prisma.sesion.deleteMany({ where: { usuarioId: { in: userIds } } });
      await prisma.usuarioInterno.updateMany({ where: { id: { in: userIds } }, data: { activo: false } });
    }
    if (userId) await prisma.usuarioRol.deleteMany({ where: { usuarioId: userId } });
    if (anonymousTokenHashes.length) await prisma.sesion.deleteMany({ where: { tokenHash: { in: anonymousTokenHashes } } });
    if (authenticatedTokenHashes.length) await prisma.sesion.deleteMany({ where: { tokenHash: { in: authenticatedTokenHashes } } });
    if (demoCourierIds.length) await prisma.repartidor.updateMany({ where: { id: { in: demoCourierIds } }, data: { activo: false } });
  } finally {
    try {
      await stopLocalViteProxy(proxy);
    } finally {
      try {
        await stopControlledBackend(backend);
      } finally {
        await prisma.$disconnect();
      }
    }
  }
}
