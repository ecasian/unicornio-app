import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const presentaciones = await prisma.presentacion.findMany({
    select: { nombre: true, litrosEquivalentes: true },
    orderBy: { nombre: 'asc' },
  });
  assert.deepEqual(presentaciones, [
    { nombre: '1 litro', litrosEquivalentes: 1 },
    { nombre: '1/2 litro', litrosEquivalentes: 0.5 },
  ]);

  const nombre = `Verificación de unicidad ${randomUUID()}`;
  try {
    await prisma.$transaction(async (transaction) => {
      const sabor = await transaction.sabor.create({ data: { nombre } });
      const pair = { saborId: sabor.id, presentacionId: (await transaction.presentacion.findFirstOrThrow()).id };
      await transaction.saborPresentacion.create({ data: pair });
      await transaction.saborPresentacion.create({ data: pair });
      throw new Error('La base de datos aceptó una combinación duplicada');
    });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
  }

  assert.equal(await prisma.sabor.findFirst({ where: { nombre } }), null, 'La transacción de prueba debe revertirse');
  console.log('Catálogo verificado en PostgreSQL: dos presentaciones y combinación única.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
