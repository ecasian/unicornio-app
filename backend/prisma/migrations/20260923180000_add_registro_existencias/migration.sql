CREATE TYPE "TipoMovimiento" AS ENUM ('REGISTRO_EXISTENCIAS', 'PEDIDO_PRODUCCION');

CREATE TABLE "RegistroExistencias" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "repartidorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RegistroExistencias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DetalleExistencias" (
    "registroExistenciasId" INTEGER NOT NULL,
    "saborId" INTEGER NOT NULL,
    "presentacionId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    CONSTRAINT "DetalleExistencias_pkey" PRIMARY KEY ("registroExistenciasId", "saborId", "presentacionId"),
    CONSTRAINT "DetalleExistencias_cantidad_check" CHECK ("cantidad" >= 0)
);

CREATE TABLE "MovimientoBitacora" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "repartidorId" INTEGER NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "registroExistenciasId" INTEGER,
    "pedidoProduccionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MovimientoBitacora_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MovimientoBitacora_referencia_check" CHECK (
      ("tipo" = 'REGISTRO_EXISTENCIAS' AND "registroExistenciasId" IS NOT NULL AND "pedidoProduccionId" IS NULL)
      OR ("tipo" = 'PEDIDO_PRODUCCION' AND "registroExistenciasId" IS NULL AND "pedidoProduccionId" IS NOT NULL)
    )
);

CREATE INDEX "RegistroExistencias_clienteId_createdAt_idx" ON "RegistroExistencias"("clienteId", "createdAt");
CREATE UNIQUE INDEX "MovimientoBitacora_registroExistenciasId_key" ON "MovimientoBitacora"("registroExistenciasId");
CREATE UNIQUE INDEX "MovimientoBitacora_pedidoProduccionId_key" ON "MovimientoBitacora"("pedidoProduccionId");

ALTER TABLE "RegistroExistencias" ADD CONSTRAINT "RegistroExistencias_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistroExistencias" ADD CONSTRAINT "RegistroExistencias_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "Repartidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetalleExistencias" ADD CONSTRAINT "DetalleExistencias_registroExistenciasId_fkey" FOREIGN KEY ("registroExistenciasId") REFERENCES "RegistroExistencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetalleExistencias" ADD CONSTRAINT "DetalleExistencias_saborId_fkey" FOREIGN KEY ("saborId") REFERENCES "Sabor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetalleExistencias" ADD CONSTRAINT "DetalleExistencias_presentacionId_fkey" FOREIGN KEY ("presentacionId") REFERENCES "Presentacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoBitacora" ADD CONSTRAINT "MovimientoBitacora_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoBitacora" ADD CONSTRAINT "MovimientoBitacora_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "Repartidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoBitacora" ADD CONSTRAINT "MovimientoBitacora_registroExistenciasId_fkey" FOREIGN KEY ("registroExistenciasId") REFERENCES "RegistroExistencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
