CREATE TABLE "Sabor" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Sabor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Presentacion" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "litrosEquivalentes" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Presentacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaborPresentacion" (
    "saborId" INTEGER NOT NULL,
    "presentacionId" INTEGER NOT NULL,
    "habilitada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SaborPresentacion_pkey" PRIMARY KEY ("saborId","presentacionId")
);

CREATE UNIQUE INDEX "Presentacion_nombre_key" ON "Presentacion"("nombre");
ALTER TABLE "SaborPresentacion" ADD CONSTRAINT "SaborPresentacion_saborId_fkey" FOREIGN KEY ("saborId") REFERENCES "Sabor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaborPresentacion" ADD CONSTRAINT "SaborPresentacion_presentacionId_fkey" FOREIGN KEY ("presentacionId") REFERENCES "Presentacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Presentacion" ("nombre", "litrosEquivalentes", "updatedAt") VALUES
    ('1 litro', 1, CURRENT_TIMESTAMP),
    ('1/2 litro', 0.5, CURRENT_TIMESTAMP);
