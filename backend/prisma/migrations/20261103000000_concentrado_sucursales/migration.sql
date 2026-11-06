CREATE TYPE "EstadoConcentradoSucursal" AS ENUM ('BORRADOR', 'CONFIRMADO');

CREATE TABLE "Sucursal" (
  "id" SERIAL NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Sucursal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Sucursal_nombre_key" ON "Sucursal"("nombre");

CREATE TABLE "ConcentradoSucursales" (
  "id" SERIAL NOT NULL,
  "fecha" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConcentradoSucursales_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConcentradoSucursales_fecha_key" ON "ConcentradoSucursales"("fecha");

CREATE TABLE "NecesidadSucursal" (
  "id" SERIAL NOT NULL,
  "concentradoId" INTEGER NOT NULL,
  "sucursalId" INTEGER NOT NULL,
  "estado" "EstadoConcentradoSucursal" NOT NULL DEFAULT 'BORRADOR',
  "confirmadoAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NecesidadSucursal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NecesidadSucursal_concentradoId_fkey" FOREIGN KEY ("concentradoId") REFERENCES "ConcentradoSucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NecesidadSucursal_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NecesidadSucursal_concentradoId_sucursalId_key" ON "NecesidadSucursal"("concentradoId", "sucursalId");

CREATE TABLE "DetalleNecesidadSucursal" (
  "necesidadSucursalId" INTEGER NOT NULL,
  "saborId" INTEGER NOT NULL,
  "capacidadLitros" INTEGER NOT NULL,
  "cantidad" INTEGER NOT NULL,
  CONSTRAINT "DetalleNecesidadSucursal_pkey" PRIMARY KEY ("necesidadSucursalId", "saborId", "capacidadLitros"),
  CONSTRAINT "DetalleNecesidadSucursal_necesidadSucursalId_fkey" FOREIGN KEY ("necesidadSucursalId") REFERENCES "NecesidadSucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DetalleNecesidadSucursal_saborId_fkey" FOREIGN KEY ("saborId") REFERENCES "Sabor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DetalleNecesidadSucursal_capacidad_check" CHECK ("capacidadLitros" IN (4, 6, 10)),
  CONSTRAINT "DetalleNecesidadSucursal_cantidad_check" CHECK ("cantidad" >= 0)
);
CREATE INDEX "DetalleNecesidadSucursal_saborId_capacidadLitros_idx" ON "DetalleNecesidadSucursal"("saborId", "capacidadLitros");
