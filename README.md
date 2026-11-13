# Unicornio

Aplicación web para administrar clientes, catálogos y surtido, y registrar
visitas y existencias de reparto. Incluye una consulta de solo lectura de
producción diaria. Las reglas de dominio están en `AGENTS.md` y
`docs/ARCHITECTURE.md`.

## Requisitos

- Node.js 24 y npm 11, o versiones compatibles con las dependencias instaladas.
- Docker y Docker Compose para PostgreSQL local.

## Instalación

Desde la raíz del repositorio:

```powershell
Copy-Item .env.example .env
npm install --prefix backend
npm install --prefix frontend
```

Usa los mismos valores de usuario, contraseña, base de datos y puerto en
`POSTGRES_*` y `DATABASE_URL`. Cambia la contraseña de ejemplo antes de levantar
PostgreSQL. `.env` está ignorado por Git.

## Variables de entorno

La aplicación usa el archivo `.env` en la raíz:

| Variable | Uso |
| --- | --- |
| `POSTGRES_USER` | Usuario de PostgreSQL local. |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL local. |
| `POSTGRES_DB` | Base de datos local. |
| `POSTGRES_PORT` | Puerto publicado por Compose. |
| `DATABASE_URL` | Conexión PostgreSQL para Prisma. |
| `BACKEND_PORT` | Puerto de NestJS. |
| `API_PROXY_TARGET` | Destino local del proxy `/api` de Vite; por defecto `http://127.0.0.1:3000`. No se incluye en el bundle. |
| `PUBLIC_ORIGIN` | Origen exacto desde el que se sirve la SPA, por defecto `http://127.0.0.1:4173`; se valida para CSRF y cookies. |
| `BUSINESS_TIMEZONE` | Zona horaria para la fecha local de llegada y Producción; por defecto `America/Mexico_City`. |

## Iniciar PostgreSQL

```powershell
docker compose up -d --wait postgres
```

Compose espera a que el healthcheck marque PostgreSQL como `healthy`, usa
`.env` y mantiene los datos en el volumen `postgres_data`. El esquema Prisma y
las migraciones versionadas definen el modelo de dominio.

## Iniciar backend y frontend

En dos terminales, desde la raíz:

```powershell
npm run dev --prefix backend
```

```powershell
npm run dev --prefix frontend
```

URLs predeterminadas:

- Frontend y API same-origin: `http://127.0.0.1:4173/`
- Health: `http://127.0.0.1:4173/api/health`
- Swagger local: `http://127.0.0.1:3000/api/docs`

La pantalla `/login` autentica usuarios internos. No existe una cuenta por
defecto: el primer administrador se crea de forma interactiva con
`npm run bootstrap:admin --prefix backend`, después de compilar y aplicar las
migraciones. Antes de ese comando, confirma que `DATABASE_URL` apunta a la base
local que quieres inicializar; no lo ejecutes contra staging o producción.
`/api/health` indica disponibilidad del backend; no comprueba el estado de
PostgreSQL.

## Inicio de Repartidor

La vista móvil para repartidores se abre directamente en `/repartidor`. Selecciona
un repartidor activo, luego un cliente activo y muestra el surtido operativo
configurado para ese cliente. El botón para continuar al levantamiento permite
registrar un snapshot completo cuando hay surtido operativo y se ha pulsado
«Llegué a la tienda». La llegada queda registrada con la hora del servidor y
el snapshot se vincula a esa visita. Al guardarlo se crea automáticamente un
pedido con sus faltantes positivos, si los hay, y los movimientos de bitácora.
Si no hay faltantes, la confirmación indica que no se requiere producción.
Si se detecta un error, «Corregir existencias» crea un nuevo snapshot sin
alterar el anterior. Se conserva el pedido anterior como `SUSTITUIDO` y se
recalcula uno `VIGENTE` cuando persisten faltantes. Solo el último snapshot de
la cadena puede corregirse; los registros anteriores continúan consultables.
Las selecciones se guardan
solo en memoria durante el flujo actual y se pierden al recargar la página;
entonces será necesario seleccionar de nuevo y registrar otra llegada.

## Producción D-1

`/produccion` muestra de solo lectura los pedidos `VIGENTE` ligados a snapshots
vigentes cuya `VisitaCliente.llegadaAt` corresponde al día local seleccionado.
Sin selector explícito, el backend consulta el día calendario anterior en
`BUSINESS_TIMEZONE` (`America/Mexico_City` por defecto). Se puede consultar una
fecha pasada o futura con el selector. La corrección de un levantamiento
conserva el día de la visita original; los pedidos sustituidos o snapshots ya
corregidos no aparecen. La vista muestra detalle por tienda y un consolidado
por sabor/presentación desde el mismo conjunto de pedidos. No permite editar
ni enviar pedidos.

## Historial de visitas de Administración

`/admin/visitas` permite consultar las llegadas registradas para un día,
opcionalmente filtradas por cliente y repartidor. La fecha inicial la resuelve
el backend: si se omite, usa hoy en `BUSINESS_TIMEZONE`
(`America/Mexico_City` por defecto). La fuente de verdad es
`VisitaCliente.llegadaAt`; cada evento se muestra, aunque haya varias visitas
al mismo cliente durante el día o el cliente/repartidor esté ahora inactivo.
La pantalla y `GET /api/admin/visitas` son de solo lectura. El panel no tiene
autenticación todavía y no constituye una barrera de seguridad.

## Lint, pruebas y builds

```powershell
npm run lint --prefix backend
npm run test --prefix backend
npm run build --prefix backend
npm run lint --prefix frontend
npm run test --prefix frontend
npm run build --prefix frontend
```

La verificación de correcciones usa exclusivamente el PostgreSQL local definido
en `.env`: `npm run verify:correcciones-db --prefix backend`. Comprueba la cadena
de versiones, pedidos, constraints, concurrencia y rollback.

Para validar la configuración de Prisma con `.env` presente:

```powershell
npm run prisma:validate --prefix backend
```

La vista `/produccion` consulta por fecha local de llegada y devuelve detalle
por tienda más consolidado. Para verificarla con PostgreSQL local y datos
temporales acotados, ejecuta:

```powershell
npm run verify:produccion-db --prefix backend
```

El verificador compila el backend, comprueba que `DATABASE_URL` apunte a
loopback y elimina únicamente las filas vinculadas a sus fixtures.

## Verificación del catálogo en PostgreSQL

Con la migración aplicada y `DATABASE_URL` configurada en `.env`, ejecuta:

```powershell
npm run verify:catalogo-db --prefix backend
```

Esta comprobación lee las dos presentaciones iniciales y prueba la unicidad de
`(saborId, presentacionId)` con una transacción que se revierte. Requiere una
base PostgreSQL disponible y sirve también como paso de CI tras aplicar las
migraciones.

## Verificación de StockObjetivo en PostgreSQL

Con PostgreSQL disponible, aplica las migraciones desde `backend`:

```powershell
Push-Location backend
npx dotenv -e ../.env -- prisma migrate deploy
Pop-Location
```

Después, desde la raíz:

```powershell
npm run verify:stock-db --prefix backend
```

El comando genera el cliente Prisma y compila el backend antes de probar la API contra PostgreSQL real.
Comprueba el reemplazo concurrente por cliente y el rollback tras un fallo;
los registros temporales se eliminan al terminar.

## Verificación de Registro de Existencias en PostgreSQL

Después de aplicar las migraciones con el comando anterior, ejecuta:

```powershell
npm run verify:existencias-db --prefix backend
```

El comando genera el cliente Prisma y compila antes de comprobar contra
PostgreSQL real el snapshot completo, los ceros, la bitácora, la unicidad,
los constraints de existencias y pedido, y el rollback si falla cualquier
componente de la operación. Elimina
los registros temporales al terminar.

## Datos de demostración en Railway staging

Tras confirmar que el Backend público pertenece a `unicornio-app/staging`, ejecuta:

```powershell
npm run seed:staging --prefix backend
```

El script usa exclusivamente la API HTTPS de staging indicada en
`backend/scripts/seed-staging.mjs`; no necesita `DATABASE_URL` ni ejecuta
migraciones. Comprueba el destino y las dos presentaciones antes de escribir,
busca los catálogos por sus nombres `Demo` y omite los valores que ya
coinciden. Se detiene si un cliente Demo tiene stock adicional que un
reemplazo completo podría eliminar. No crea snapshots ni pedidos. Si Railway
recrea el environment o cambia el dominio, vuelve a verificar el destino antes
de actualizar el script. Como staging no tiene autenticación, usa solo datos
ficticios.

## Configuración futura de Railway staging

Este slice no ha cambiado ni desplegado Railway. Al preparar el próximo deploy,
conserva los servicios actuales y configura el Frontend como contenedor desde
`frontend/Dockerfile`. Caddy sirve la SPA y proxy `/api/*` al Backend privado.

Variables requeridas para esa configuración futura:

- Frontend: `BACKEND_UPSTREAM` debe ser la URL privada completa del Backend, con el puerto interno confirmado en Railway; `PORT` lo asigna la plataforma y Caddy lo usa para escuchar.
- Backend: `PUBLIC_ORIGIN` debe ser el origen HTTPS exacto del Frontend, sin path ni barra final. Conserva `DATABASE_URL` y `BUSINESS_TIMEZONE` existentes.
- El backend debe aceptar tráfico solo desde Caddy por red privada. Esto permite validar el `Origin` de la SPA y evita confiar en un `X-Forwarded-For` enviado directamente por un cliente.
- No configurar `FRONTEND_URL` ni `VITE_API_URL`; el backend no usa CORS para este contrato y el bundle solo solicita rutas relativas `/api`.

No se fija aquí el host ni el puerto privado: deben verificarse en los metadatos
de los servicios antes de configurar `BACKEND_UPSTREAM`. En producción o
staging, no consideres autenticación validada hasta comprobar cookies `Secure`,
proxy, CSRF, sesión, revocación y la matriz 401/403 directamente en ese
environment. El staging actualmente desplegado permanece en su versión
anterior hasta un deploy autorizado.
