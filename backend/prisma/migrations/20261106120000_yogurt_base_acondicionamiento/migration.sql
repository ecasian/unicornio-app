CREATE TABLE "LoteYogurtBase" (
  "id" SERIAL NOT NULL,
  "fechaElaboracion" DATE NOT NULL,
  "cubetas10L" INTEGER NOT NULL,
  "cubetas6L" INTEGER NOT NULL,
  "cubetas4L" INTEGER NOT NULL,
  "litrosReales" DECIMAL(14,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoteYogurtBase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoteYogurtBase_cubetas_check" CHECK ("cubetas10L" >= 0 AND "cubetas6L" >= 0 AND "cubetas4L" >= 0 AND "cubetas10L" + "cubetas6L" + "cubetas4L" > 0),
  CONSTRAINT "LoteYogurtBase_litros_check" CHECK ("litrosReales" > 0)
);
CREATE INDEX "LoteYogurtBase_fechaElaboracion_idx" ON "LoteYogurtBase"("fechaElaboracion");

CREATE TABLE "AcondicionamientoYogurtBase" (
  "id" SERIAL NOT NULL,
  "loteId" INTEGER NOT NULL,
  "saborId" INTEGER NOT NULL,
  "claveSolicitud" UUID NOT NULL,
  "litrosConsumidos" DECIMAL(14,3) NOT NULL,
  "litrosObtenidos" DECIMAL(14,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcondicionamientoYogurtBase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcondicionamientoYogurtBase_claveSolicitud_key" UNIQUE ("claveSolicitud"),
  CONSTRAINT "AcondicionamientoYogurtBase_litros_check" CHECK ("litrosConsumidos" > 0 AND "litrosObtenidos" > 0),
  CONSTRAINT "AcondicionamientoYogurtBase_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteYogurtBase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcondicionamientoYogurtBase_saborId_fkey" FOREIGN KEY ("saborId") REFERENCES "Sabor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AcondicionamientoYogurtBase_loteId_createdAt_idx" ON "AcondicionamientoYogurtBase"("loteId", "createdAt");
CREATE INDEX "AcondicionamientoYogurtBase_saborId_createdAt_idx" ON "AcondicionamientoYogurtBase"("saborId", "createdAt");
