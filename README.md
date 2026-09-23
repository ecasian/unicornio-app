# Unicornio

Scaffolding técnico de una aplicación web con frontend React y API NestJS.
Las reglas de dominio están en `AGENTS.md` y `docs/ARCHITECTURE.md`; aún no hay
modelos de dominio, flujos operativos ni pantallas del producto.

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
| `FRONTEND_URL` | Origen permitido por CORS. |
| `VITE_API_URL` | URL base de la API que consume Vite. |

## Iniciar PostgreSQL

```powershell
docker compose up -d --wait postgres
```

Compose espera a que el healthcheck marque PostgreSQL como `healthy`, usa
`.env` y mantiene los datos en el volumen `postgres_data`. El
esquema Prisma solo define la conexión; todavía no contiene modelos ni
migraciones de dominio.

## Iniciar backend y frontend

En dos terminales, desde la raíz:

```powershell
npm run dev --prefix backend
```

```powershell
npm run dev --prefix frontend
```

URLs predeterminadas:

- Frontend: `http://localhost:5173/`
- Health: `http://localhost:3000/api/health`
- Swagger: `http://localhost:3000/api/docs`

La pantalla inicial consulta el endpoint de health y muestra si la API está
disponible. El health indica disponibilidad del backend; no comprueba el estado
de PostgreSQL.

## Inicio de Repartidor

La vista móvil para repartidores se abre directamente en `/repartidor`. Selecciona
un repartidor activo, luego un cliente activo y muestra el surtido operativo
configurado para ese cliente. Todavía no captura existencias; el botón para
continuar al levantamiento permanece deshabilitado. Las selecciones se guardan
solo en memoria durante el flujo actual y se pierden al recargar la página.

## Lint, pruebas y builds

```powershell
npm run lint --prefix backend
npm run test --prefix backend
npm run build --prefix backend
npm run lint --prefix frontend
npm run test --prefix frontend
npm run build --prefix frontend
```

Para validar la configuración de Prisma con `.env` presente:

```powershell
npm run prisma:validate --prefix backend
```

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

## Staging en Railway

El proyecto Railway `unicornio-app` usa el environment `staging` con tres
servicios. `Postgres` permanece en la red privada; `Backend` y `Frontend`
tienen dominios HTTPS públicos. Cada aplicación se construye desde su propio
directorio del monorepo (`/backend` y `/frontend`).

| Servicio | Configuración |
| --- | --- |
| Backend | Build: `npx prisma generate && npm run build`; pre-deploy: `npx prisma migrate deploy`; start: `npm run start`; health check: `/api/health`. |
| Frontend | Build: `npm run build`; start: `npm run start` (sirve `dist` en `$PORT` con fallback SPA); health check: `/`. |
| Postgres | Base de datos privada, sin dominio TCP público. |

Variables de `Backend` en `staging`:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
FRONTEND_URL=https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}
```

Variable de `Frontend` en `staging`:

```text
VITE_API_URL=https://${{Backend.RAILWAY_PUBLIC_DOMAIN}}/api
```

Railway asigna `PORT` a cada servicio web. El backend lo prioriza sobre
`BACKEND_PORT` y escucha en `0.0.0.0`. `VITE_API_URL` se incorpora al frontend
durante el build: si cambia el dominio del backend, vuelve a desplegar el
frontend. Las migraciones Prisma se aplican en pre-deploy antes de iniciar el
backend; un fallo de migración impide publicar esa versión.

URLs de staging:

- Frontend: https://frontend-staging-b7bb.up.railway.app/
- Backend: https://backend-staging-f866.up.railway.app/api

Por ahora el despliegue se hace desde el checkout local validado, primero
Backend y después Frontend; la conexión automática con `main` queda pendiente.
Para validar, abre `/`, `/repartidor` y `/admin/clientes` en el frontend y
`/api/health` en el backend. El health indica que la API responde, no que la
base de datos esté disponible.

**Staging no tiene autenticación. Usa exclusivamente datos demo, nunca datos
reales de clientes, teléfonos o direcciones.**
