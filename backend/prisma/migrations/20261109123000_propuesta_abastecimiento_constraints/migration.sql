ALTER TABLE "PropuestaAbastecimiento"
  ADD CONSTRAINT "PropuestaAbastecimiento_version_positive_check" CHECK ("version" > 0),
  ADD CONSTRAINT "PropuestaAbastecimiento_status_timestamp_check" CHECK (
    ("estado" = 'BORRADOR' AND "confirmadaAt" IS NULL)
    OR ("estado" = 'CONFIRMADA' AND "confirmadaAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "PropuestaAbastecimiento_source_snapshot_check" CHECK (
    ("fuenteReporteId" IS NULL AND "fuenteFecha" IS NULL AND "fuenteTurno" IS NULL AND "fuenteConfirmadoAt" IS NULL)
    OR ("fuenteReporteId" IS NOT NULL AND "fuenteFecha" IS NOT NULL AND "fuenteTurno" = 'VESPERTINO' AND "fuenteConfirmadoAt" IS NOT NULL)
  );

ALTER TABLE "DetallePropuestaAbastecimiento"
  ADD CONSTRAINT "DetallePropuestaAbastecimiento_nonnegative_check" CHECK (
    ("objetivoLitros" IS NULL OR "objetivoLitros" >= 0)
    AND ("existenciaLitros" IS NULL OR "existenciaLitros" >= 0)
    AND ("sugerenciaLitros" IS NULL OR "sugerenciaLitros" >= 0)
    AND ("decisionLitros" IS NULL OR "decisionLitros" >= 0)
  ),
  ADD CONSTRAINT "DetallePropuestaAbastecimiento_reference_state_check" CHECK (
    ("estadoReferencia" = 'DISPONIBLE' AND "objetivoLitros" IS NOT NULL AND "existenciaLitros" IS NOT NULL AND "sugerenciaLitros" IS NOT NULL)
    OR ("estadoReferencia" = 'SIN_DATOS' AND "sugerenciaLitros" IS NULL)
  );
