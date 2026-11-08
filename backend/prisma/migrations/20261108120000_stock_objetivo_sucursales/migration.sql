CREATE TABLE "StockObjetivoSucursal" (
    "sucursalId" INTEGER NOT NULL,
    "saborId" INTEGER NOT NULL,
    "litros" DECIMAL(14,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockObjetivoSucursal_pkey" PRIMARY KEY ("sucursalId", "saborId"),
    CONSTRAINT "StockObjetivoSucursal_litros_nonnegative" CHECK ("litros" >= 0),
    CONSTRAINT "StockObjetivoSucursal_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockObjetivoSucursal_saborId_fkey" FOREIGN KEY ("saborId") REFERENCES "Sabor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "StockObjetivoSucursal_saborId_idx" ON "StockObjetivoSucursal"("saborId");
