CREATE TYPE "TurnoInventarioSucursal" AS ENUM ('MATUTINO', 'VESPERTINO');

-- Existing reports stay intact and unassigned; the application exposes them as pre-shift history.
ALTER TABLE "ReporteInventarioSucursal" ADD COLUMN "turno" "TurnoInventarioSucursal";

DROP INDEX "ReporteInventarioSucursal_fecha_sucursalId_key";
DROP INDEX "ReporteInventarioSucursal_fecha_estado_idx";

CREATE UNIQUE INDEX "ReporteInventarioSucursal_sucursalId_fecha_turno_key"
    ON "ReporteInventarioSucursal"("sucursalId", "fecha", "turno");

-- PostgreSQL treats NULLs as distinct in the shift-specific unique index; retain one legacy row per branch/date.
CREATE UNIQUE INDEX "ReporteInventarioSucursal_legacy_sucursalId_fecha_key"
    ON "ReporteInventarioSucursal"("sucursalId", "fecha")
    WHERE "turno" IS NULL;

CREATE INDEX "ReporteInventarioSucursal_fecha_turno_estado_idx"
    ON "ReporteInventarioSucursal"("fecha", "turno", "estado");
CREATE INDEX "ReporteInventarioSucursal_sucursalId_turno_fecha_idx"
    ON "ReporteInventarioSucursal"("sucursalId", "turno", "fecha");
