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
