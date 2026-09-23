CREATE TABLE "StockObjetivo" (
    "clienteId" INTEGER NOT NULL,
    "saborId" INTEGER NOT NULL,
    "presentacionId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StockObjetivo_pkey" PRIMARY KEY ("clienteId","saborId","presentacionId"),
    CONSTRAINT "StockObjetivo_cantidad_check" CHECK ("cantidad" >= 0)
);

ALTER TABLE "StockObjetivo" ADD CONSTRAINT "StockObjetivo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockObjetivo" ADD CONSTRAINT "StockObjetivo_saborId_fkey" FOREIGN KEY ("saborId") REFERENCES "Sabor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockObjetivo" ADD CONSTRAINT "StockObjetivo_presentacionId_fkey" FOREIGN KEY ("presentacionId") REFERENCES "Presentacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
