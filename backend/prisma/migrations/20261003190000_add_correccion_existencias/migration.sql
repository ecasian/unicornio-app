CREATE TYPE "EstadoPedidoProduccion" AS ENUM ('VIGENTE', 'SUSTITUIDO');

ALTER TABLE "PedidoProduccion"
  ADD COLUMN "estado" "EstadoPedidoProduccion" NOT NULL DEFAULT 'VIGENTE';

ALTER TABLE "RegistroExistencias"
  ADD COLUMN "corrigeRegistroExistenciasId" INTEGER;

CREATE UNIQUE INDEX "RegistroExistencias_corrigeRegistroExistenciasId_key"
  ON "RegistroExistencias"("corrigeRegistroExistenciasId");

ALTER TABLE "RegistroExistencias"
  ADD CONSTRAINT "RegistroExistencias_corrigeRegistroExistenciasId_fkey"
  FOREIGN KEY ("corrigeRegistroExistenciasId") REFERENCES "RegistroExistencias"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RegistroExistencias"
  ADD CONSTRAINT "RegistroExistencias_no_autocorreccion_check"
  CHECK ("corrigeRegistroExistenciasId" IS NULL OR "corrigeRegistroExistenciasId" <> "id");
