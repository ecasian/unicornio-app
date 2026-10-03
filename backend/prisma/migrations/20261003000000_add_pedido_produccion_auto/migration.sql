CREATE TABLE "PedidoProduccion" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "repartidorId" INTEGER NOT NULL,
    "registroExistenciasId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PedidoProduccion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DetallePedido" (
    "pedidoProduccionId" INTEGER NOT NULL,
    "saborId" INTEGER NOT NULL,
    "presentacionId" INTEGER NOT NULL,
    "cantidadSugerida" INTEGER NOT NULL,
    "cantidadSolicitada" INTEGER NOT NULL,
    CONSTRAINT "DetallePedido_pkey" PRIMARY KEY ("pedidoProduccionId", "saborId", "presentacionId"),
    CONSTRAINT "DetallePedido_cantidadSugerida_check" CHECK ("cantidadSugerida" >= 0),
    CONSTRAINT "DetallePedido_cantidadSolicitada_check" CHECK ("cantidadSolicitada" >= 0)
);

CREATE UNIQUE INDEX "PedidoProduccion_registroExistenciasId_key" ON "PedidoProduccion"("registroExistenciasId");

ALTER TABLE "PedidoProduccion" ADD CONSTRAINT "PedidoProduccion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PedidoProduccion" ADD CONSTRAINT "PedidoProduccion_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "Repartidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PedidoProduccion" ADD CONSTRAINT "PedidoProduccion_registroExistenciasId_fkey" FOREIGN KEY ("registroExistenciasId") REFERENCES "RegistroExistencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetallePedido" ADD CONSTRAINT "DetallePedido_pedidoProduccionId_fkey" FOREIGN KEY ("pedidoProduccionId") REFERENCES "PedidoProduccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetallePedido" ADD CONSTRAINT "DetallePedido_saborId_fkey" FOREIGN KEY ("saborId") REFERENCES "Sabor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetallePedido" ADD CONSTRAINT "DetallePedido_presentacionId_fkey" FOREIGN KEY ("presentacionId") REFERENCES "Presentacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoBitacora" ADD CONSTRAINT "MovimientoBitacora_pedidoProduccionId_fkey" FOREIGN KEY ("pedidoProduccionId") REFERENCES "PedidoProduccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
