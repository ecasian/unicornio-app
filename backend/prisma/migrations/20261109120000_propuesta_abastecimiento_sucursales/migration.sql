CREATE TYPE "EstadoPropuestaAbastecimiento" AS ENUM ('BORRADOR', 'CONFIRMADA');
CREATE TYPE "EstadoReferenciaAbastecimiento" AS ENUM ('DISPONIBLE', 'SIN_DATOS');

CREATE TABLE "PropuestaAbastecimiento" (
    "id" SERIAL NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "estado" "EstadoPropuestaAbastecimiento" NOT NULL DEFAULT 'BORRADOR',
    "fuenteReporteId" INTEGER,
    "fuenteFecha" DATE,
    "fuenteTurno" "TurnoInventarioSucursal",
    "fuenteConfirmadoAt" TIMESTAMP(3),
    "creadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadaAt" TIMESTAMP(3),
    CONSTRAINT "PropuestaAbastecimiento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DetallePropuestaAbastecimiento" (
    "propuestaId" INTEGER NOT NULL,
    "saborId" INTEGER NOT NULL,
    "estadoReferencia" "EstadoReferenciaAbastecimiento" NOT NULL,
    "objetivoLitros" DECIMAL(14,3),
    "existenciaLitros" DECIMAL(14,3),
    "sugerenciaLitros" DECIMAL(14,3),
    "decisionLitros" DECIMAL(14,3),
    CONSTRAINT "DetallePropuestaAbastecimiento_pkey" PRIMARY KEY ("propuestaId", "saborId")
);

CREATE UNIQUE INDEX "PropuestaAbastecimiento_sucursalId_fecha_version_key" ON "PropuestaAbastecimiento"("sucursalId", "fecha", "version");
CREATE INDEX "PropuestaAbastecimiento_sucursalId_fecha_estado_version_idx" ON "PropuestaAbastecimiento"("sucursalId", "fecha", "estado", "version");
CREATE INDEX "DetallePropuestaAbastecimiento_saborId_idx" ON "DetallePropuestaAbastecimiento"("saborId");

ALTER TABLE "PropuestaAbastecimiento" ADD CONSTRAINT "PropuestaAbastecimiento_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PropuestaAbastecimiento" ADD CONSTRAINT "PropuestaAbastecimiento_fuenteReporteId_fkey" FOREIGN KEY ("fuenteReporteId") REFERENCES "ReporteInventarioSucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetallePropuestaAbastecimiento" ADD CONSTRAINT "DetallePropuestaAbastecimiento_propuestaId_fkey" FOREIGN KEY ("propuestaId") REFERENCES "PropuestaAbastecimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetallePropuestaAbastecimiento" ADD CONSTRAINT "DetallePropuestaAbastecimiento_saborId_fkey" FOREIGN KEY ("saborId") REFERENCES "Sabor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
