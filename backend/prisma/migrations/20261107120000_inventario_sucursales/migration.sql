CREATE TYPE "EstadoInventarioSucursal" AS ENUM ('BORRADOR', 'CONFIRMADO');

CREATE TABLE "ReporteInventarioSucursal" (
    "id" SERIAL NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "EstadoInventarioSucursal" NOT NULL DEFAULT 'BORRADOR',
    "confirmadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReporteInventarioSucursal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DetalleInventarioSucursal" (
    "reporteId" INTEGER NOT NULL,
    "saborId" INTEGER NOT NULL,
    "litros" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "DetalleInventarioSucursal_pkey" PRIMARY KEY ("reporteId", "saborId"),
    CONSTRAINT "DetalleInventarioSucursal_litros_nonnegative" CHECK ("litros" >= 0)
);

CREATE UNIQUE INDEX "ReporteInventarioSucursal_fecha_sucursalId_key" ON "ReporteInventarioSucursal"("fecha", "sucursalId");
CREATE INDEX "ReporteInventarioSucursal_fecha_estado_idx" ON "ReporteInventarioSucursal"("fecha", "estado");
CREATE INDEX "DetalleInventarioSucursal_saborId_idx" ON "DetalleInventarioSucursal"("saborId");

ALTER TABLE "ReporteInventarioSucursal" ADD CONSTRAINT "ReporteInventarioSucursal_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetalleInventarioSucursal" ADD CONSTRAINT "DetalleInventarioSucursal_reporteId_fkey" FOREIGN KEY ("reporteId") REFERENCES "ReporteInventarioSucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetalleInventarioSucursal" ADD CONSTRAINT "DetalleInventarioSucursal_saborId_fkey" FOREIGN KEY ("saborId") REFERENCES "Sabor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
