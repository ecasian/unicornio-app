import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TipoMovimiento, type Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service.js';
import { STOCK_OBJETIVO_LOCK_NAMESPACE, StockObjetivoService } from '../stock-objetivo/stock-objetivo.service.js';
import { CreateRegistroExistenciasDto } from './dto/create-registro-existencias.dto.js';

const registroDetails = {
  cliente: { select: { id: true, nombre: true } },
  repartidor: { select: { id: true, nombre: true } },
  detalles: { orderBy: [{ saborId: 'asc' }, { presentacionId: 'asc' }] },
  movimiento: { select: { id: true, tipo: true, createdAt: true } },
} satisfies Prisma.RegistroExistenciasInclude;

@Injectable()
export class ExistenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockObjetivo: StockObjetivoService,
  ) {}

  async get(clienteId: number, id: number) {
    const registro = await this.prisma.registroExistencias.findUnique({
      where: { id }, include: registroDetails,
    });
    if (!registro || registro.clienteId !== clienteId) {
      throw new NotFoundException('Registro de existencias no encontrado');
    }
    return registro;
  }

  async create(clienteId: number, data: CreateRegistroExistenciasDto) {
    const keys = data.existencias.map((item) => `${item.saborId}:${item.presentacionId}`);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('No repitas una combinación de sabor y presentación');
    }

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${STOCK_OBJETIVO_LOCK_NAMESPACE}::integer, ${clienteId}::integer)`;

      // El lock por cliente estabiliza StockObjetivo. Los locks de filas impiden
      // cambios de catálogo entre su validación y la escritura del snapshot.
      // READ COMMITTED toma estas lecturas después de esperar el advisory lock.
      await transaction.$queryRaw`SELECT id FROM "Cliente" WHERE id = ${clienteId} FOR SHARE`;
      await transaction.$queryRaw`SELECT id FROM "Repartidor" WHERE id = ${data.repartidorId} FOR SHARE`;
      await transaction.$queryRaw`
        SELECT s.id FROM "Sabor" s
        JOIN "StockObjetivo" so ON so."saborId" = s.id
        WHERE so."clienteId" = ${clienteId}
        ORDER BY s.id, so."presentacionId"
        FOR SHARE OF s
      `;
      await transaction.$queryRaw`
        SELECT sp."saborId", sp."presentacionId" FROM "SaborPresentacion" sp
        JOIN "StockObjetivo" so ON so."saborId" = sp."saborId" AND so."presentacionId" = sp."presentacionId"
        WHERE so."clienteId" = ${clienteId}
        ORDER BY sp."saborId", sp."presentacionId"
        FOR SHARE OF sp
      `;

      const repartidor = await transaction.repartidor.findUnique({ where: { id: data.repartidorId } });
      if (!repartidor) throw new NotFoundException('Repartidor no encontrado');
      if (!repartidor.activo) throw new BadRequestException('El repartidor está inactivo');

      const operativo = await this.stockObjetivo.getOperativoInTransaction(transaction, clienteId);
      if (operativo.length === 0) {
        throw new BadRequestException('El cliente no tiene surtido operativo para registrar');
      }
      const expected = new Set(operativo.map((item) => `${item.saborId}:${item.presentacionId}`));
      if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
        throw new BadRequestException('El surtido operativo cambió. Recarga el levantamiento antes de guardar.');
      }

      const createdAt = new Date();
      const registro = await transaction.registroExistencias.create({
        data: {
          clienteId, repartidorId: data.repartidorId, createdAt,
          detalles: { create: data.existencias.map(({ saborId, presentacionId, cantidad }) => ({ saborId, presentacionId, cantidad })) },
        },
      });
      await transaction.movimientoBitacora.create({
        data: {
          clienteId, repartidorId: data.repartidorId, tipo: TipoMovimiento.REGISTRO_EXISTENCIAS,
          registroExistenciasId: registro.id, createdAt,
        },
      });
      return transaction.registroExistencias.findUniqueOrThrow({ where: { id: registro.id }, include: registroDetails });
    }, { maxWait: 15000, timeout: 15000 });
  }
}
