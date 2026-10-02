CREATE TABLE "VisitaCliente" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "repartidorId" INTEGER NOT NULL,
    "llegadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisitaCliente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisitaCliente_id_clienteId_repartidorId_key" ON "VisitaCliente"("id", "clienteId", "repartidorId");
CREATE INDEX "VisitaCliente_clienteId_llegadaAt_idx" ON "VisitaCliente"("clienteId", "llegadaAt");

ALTER TABLE "VisitaCliente" ADD CONSTRAINT "VisitaCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitaCliente" ADD CONSTRAINT "VisitaCliente_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "Repartidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RegistroExistencias" ADD COLUMN "visitaClienteId" INTEGER;
ALTER TABLE "RegistroExistencias" ADD CONSTRAINT "RegistroExistencias_visitaClienteId_clienteId_repartidorId_fkey"
  FOREIGN KEY ("visitaClienteId", "clienteId", "repartidorId")
  REFERENCES "VisitaCliente"("id", "clienteId", "repartidorId") ON DELETE RESTRICT ON UPDATE CASCADE;
