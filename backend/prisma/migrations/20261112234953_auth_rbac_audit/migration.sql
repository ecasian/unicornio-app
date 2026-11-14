-- CreateTable
CREATE TABLE "UsuarioInterno" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "repartidorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsuarioInterno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rol" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permiso" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "Permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioRol" (
    "usuarioId" INTEGER NOT NULL,
    "rolId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsuarioRol_pkey" PRIMARY KEY ("usuarioId","rolId")
);

-- CreateTable
CREATE TABLE "RolPermiso" (
    "rolId" INTEGER NOT NULL,
    "permisoId" INTEGER NOT NULL,

    CONSTRAINT "RolPermiso_pkey" PRIMARY KEY ("rolId","permisoId")
);

-- CreateTable
CREATE TABLE "Sesion" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "usuarioId" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoAuditoria" (
    "id" BIGSERIAL NOT NULL,
    "actorUsuarioId" INTEGER,
    "accion" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentoAcceso" (
    "claveHash" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 1,
    "ventanaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bloqueadoHasta" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntentoAcceso_pkey" PRIMARY KEY ("claveHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioInterno_email_key" ON "UsuarioInterno"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioInterno_repartidorId_key" ON "UsuarioInterno"("repartidorId");

-- CreateIndex
CREATE UNIQUE INDEX "Rol_codigo_key" ON "Rol"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Permiso_codigo_key" ON "Permiso"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Sesion_tokenHash_key" ON "Sesion"("tokenHash");

-- CreateIndex
CREATE INDEX "Sesion_usuarioId_expiresAt_revokedAt_idx" ON "Sesion"("usuarioId", "expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "EventoAuditoria_actorUsuarioId_createdAt_idx" ON "EventoAuditoria"("actorUsuarioId", "createdAt");

-- CreateIndex
CREATE INDEX "EventoAuditoria_createdAt_accion_idx" ON "EventoAuditoria"("createdAt", "accion");

-- CreateIndex
CREATE INDEX "IntentoAcceso_bloqueadoHasta_idx" ON "IntentoAcceso"("bloqueadoHasta");

-- AddForeignKey
ALTER TABLE "UsuarioInterno" ADD CONSTRAINT "UsuarioInterno_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "Repartidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioRol" ADD CONSTRAINT "UsuarioRol_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioInterno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioRol" ADD CONSTRAINT "UsuarioRol_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolPermiso" ADD CONSTRAINT "RolPermiso_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolPermiso" ADD CONSTRAINT "RolPermiso_permisoId_fkey" FOREIGN KEY ("permisoId") REFERENCES "Permiso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sesion" ADD CONSTRAINT "Sesion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioInterno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAuditoria" ADD CONSTRAINT "EventoAuditoria_actorUsuarioId_fkey" FOREIGN KEY ("actorUsuarioId") REFERENCES "UsuarioInterno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Rol" ("codigo", "nombre") VALUES
  ('ADMIN_GENERAL', 'Administrador general'),
  ('ADMIN_SUCURSALES', 'Administrador de sucursales'),
  ('REPARTIDOR', 'Repartidor'),
  ('OPERADOR_PRODUCCION', 'Operador de producción');

INSERT INTO "Permiso" ("codigo", "descripcion") VALUES
  ('auth:session', 'Consultar y cerrar la sesión propia'),
  ('usuarios:manage', 'Crear usuarios y asignar roles'),
  ('auditoria:read', 'Consultar la bitácora de auditoría'),
  ('clientes:read', 'Consultar clientes'),
  ('clientes:manage', 'Crear y editar clientes'),
  ('catalogo:read', 'Consultar sabores y presentaciones'),
  ('catalogo:manage', 'Administrar sabores y presentaciones'),
  ('stock-cliente:read', 'Consultar el surtido objetivo de clientes'),
  ('stock-cliente:manage', 'Configurar el surtido objetivo de clientes'),
  ('reparto:operate', 'Registrar visitas y existencias de clientes'),
  ('repartidores:read', 'Consultar repartidores'),
  ('repartidores:manage', 'Administrar repartidores'),
  ('produccion:read', 'Consultar producción y YogurtBase'),
  ('produccion:manage', 'Registrar lotes y acondicionamientos'),
  ('sucursales:read', 'Consultar sucursales, objetivos y concentrados'),
  ('sucursales:manage', 'Administrar objetivos y concentrados de sucursales'),
  ('inventario-sucursales:read', 'Consultar inventario de sucursales'),
  ('inventario-sucursales:manage', 'Capturar y confirmar inventario de sucursales'),
  ('abastecimiento:read', 'Consultar propuestas y consolidados de abastecimiento'),
  ('abastecimiento:manage', 'Crear, ajustar y confirmar propuestas'),
  ('visitas:read', 'Consultar el historial administrativo de visitas');

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r."id", p."id" FROM "Rol" r CROSS JOIN "Permiso" p WHERE r."codigo" = 'ADMIN_GENERAL';

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r."id", p."id" FROM "Rol" r JOIN "Permiso" p ON p."codigo" IN (
  'auth:session', 'sucursales:read', 'sucursales:manage',
  'inventario-sucursales:read', 'inventario-sucursales:manage',
  'abastecimiento:read', 'abastecimiento:manage'
) WHERE r."codigo" = 'ADMIN_SUCURSALES';

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r."id", p."id" FROM "Rol" r JOIN "Permiso" p ON p."codigo" IN (
  'auth:session', 'clientes:read', 'catalogo:read', 'stock-cliente:read',
  'reparto:operate', 'repartidores:read'
) WHERE r."codigo" = 'REPARTIDOR';

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r."id", p."id" FROM "Rol" r JOIN "Permiso" p ON p."codigo" IN (
  'auth:session', 'catalogo:read', 'produccion:read', 'produccion:manage',
  'sucursales:read', 'inventario-sucursales:read', 'abastecimiento:read'
) WHERE r."codigo" = 'OPERADOR_PRODUCCION';

CREATE FUNCTION prevent_audit_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EventoAuditoria is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EventoAuditoria_append_only"
BEFORE UPDATE OR DELETE ON "EventoAuditoria"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
