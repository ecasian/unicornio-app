import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoPedidoProduccion, TipoMovimiento, type Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service.js';
import { STOCK_OBJETIVO_LOCK_NAMESPACE, StockObjetivoService } from '../stock-objetivo/stock-objetivo.service.js';
import { CreateRegistroExistenciasDto } from './dto/create-registro-existencias.dto.js';
import { CreateCorreccionExistenciasDto } from './dto/create-correccion-existencias.dto.js';

type Existencia = { saborId: number; presentacionId: number; cantidad: number };

const registroDetails = {
  cliente: { select: { id: true, nombre: true } },
  repartidor: { select: { id: true, nombre: true } },
  detalles: {
    include: { sabor: { select: { id: true, nombre: true } }, presentacion: { select: { id: true, nombre: true } } },
    orderBy: [{ saborId: 'asc' }, { presentacionId: 'asc' }],
  },
  movimiento: { select: { id: true, tipo: true, createdAt: true } },
  pedidoProduccion: {
    include: {
      detalles: {
        include: { sabor: { select: { id: true, nombre: true } }, presentacion: { select: { id: true, nombre: true } } },
        orderBy: [{ saborId: 'asc' }, { presentacionId: 'asc' }],
      },
      movimiento: { select: { id: true, tipo: true, createdAt: true } },
    },
  },
  corregidoPor: { select: { id: true } },
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
    return this.toResponse(registro);
  }

  private toResponse(registro: Prisma.RegistroExistenciasGetPayload<{ include: typeof registroDetails }>) {
    const { corregidoPor, ...rest } = registro;
    return { ...rest, corregidoPorRegistroExistenciasId: corregidoPor?.id ?? null,
      vigente: corregidoPor === null, requiereProduccion: registro.pedidoProduccion !== null };
  }

  private validateKeys(existencias: Existencia[]) {
    const keys = existencias.map((item) => `${item.saborId}:${item.presentacionId}`);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('No repitas una combinación de sabor y presentación');
    }
    return keys;
  }

  private async lockAndGetOperativo(transaction: Prisma.TransactionClient, clienteId: number, repartidorId: number) {
      // El lock por cliente estabiliza StockObjetivo. Los locks de filas impiden
      // cambios de catálogo entre su validación y la escritura del snapshot.
      // READ COMMITTED toma estas lecturas después de esperar el advisory lock.
      await transaction.$queryRaw`SELECT id FROM "Cliente" WHERE id = ${clienteId} FOR SHARE`;
      await transaction.$queryRaw`SELECT id FROM "Repartidor" WHERE id = ${repartidorId} FOR SHARE`;
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

      const repartidor = await transaction.repartidor.findUnique({ where: { id: repartidorId } });
      if (!repartidor) throw new NotFoundException('Repartidor no encontrado');
      if (!repartidor.activo) throw new BadRequestException('El repartidor está inactivo');

      const operativo = await this.stockObjetivo.getOperativoInTransaction(transaction, clienteId);
      return operativo;
  }

  private async saveSnapshot(transaction: Prisma.TransactionClient, clienteId: number, repartidorId: number,
    visitaClienteId: number, existencias: Existencia[],
    operativo: Awaited<ReturnType<StockObjetivoService['getOperativoInTransaction']>>,
    corrigeRegistroExistenciasId?: number) {
      const createdAt = new Date();
      const registro = await transaction.registroExistencias.create({
        data: {
          clienteId, repartidorId, visitaClienteId, corrigeRegistroExistenciasId, createdAt,
          detalles: { create: existencias.map(({ saborId, presentacionId, cantidad }) => ({ saborId, presentacionId, cantidad })) },
        },
        include: { detalles: true },
      });
      const objetivos = new Map(operativo.map((item) => [`${item.saborId}:${item.presentacionId}`, item.cantidad]));
      const faltantes = registro.detalles.flatMap(({ saborId, presentacionId, cantidad }) => {
        const objetivo = objetivos.get(`${saborId}:${presentacionId}`);
        if (objetivo === undefined) throw new Error('Detalle fuera del surtido validado');
        const cantidadNecesaria = Math.max(objetivo - cantidad, 0);
        return cantidadNecesaria > 0
          ? [{ saborId, presentacionId, cantidadSugerida: cantidadNecesaria, cantidadSolicitada: cantidadNecesaria }]
          : [];
      });
      if (faltantes.length > 0) {
        const pedido = await transaction.pedidoProduccion.create({
          data: {
            clienteId, repartidorId, registroExistenciasId: registro.id, createdAt,
            detalles: { create: faltantes },
          },
        });
        await transaction.movimientoBitacora.create({
          data: {
            clienteId, repartidorId, tipo: TipoMovimiento.PEDIDO_PRODUCCION,
            pedidoProduccionId: pedido.id, createdAt,
          },
        });
      }
      await transaction.movimientoBitacora.create({
        data: {
          clienteId, repartidorId, tipo: TipoMovimiento.REGISTRO_EXISTENCIAS,
          registroExistenciasId: registro.id, createdAt,
        },
      });
      const complete = await transaction.registroExistencias.findUniqueOrThrow({ where: { id: registro.id }, include: registroDetails });
      return this.toResponse(complete);
  }

  async create(clienteId: number, data: CreateRegistroExistenciasDto) {
    const keys = this.validateKeys(data.existencias);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${STOCK_OBJETIVO_LOCK_NAMESPACE}::integer, ${clienteId}::integer)`;
      const operativo = await this.lockAndGetOperativo(transaction, clienteId, data.repartidorId);
      if (operativo.length === 0) throw new BadRequestException('El cliente no tiene surtido operativo para registrar');
      const visita = await transaction.visitaCliente.findUnique({ where: { id: data.visitaClienteId } });
      if (!visita) throw new NotFoundException('Visita no encontrada');
      if (visita.clienteId !== clienteId || visita.repartidorId !== data.repartidorId) {
        throw new BadRequestException('La visita no corresponde al cliente y repartidor seleccionados');
      }
      const expected = new Set(operativo.map((item) => `${item.saborId}:${item.presentacionId}`));
      if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
        throw new BadRequestException('El surtido operativo cambió. Recarga el levantamiento antes de guardar.');
      }

      return this.saveSnapshot(transaction, clienteId, data.repartidorId, visita.id, data.existencias, operativo);
    }, { maxWait: 15000, timeout: 15000 });
  }

  async correct(clienteId: number, registroId: number, data: CreateCorreccionExistenciasDto) {
    const keys = this.validateKeys(data.existencias);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${STOCK_OBJETIVO_LOCK_NAMESPACE}::integer, ${clienteId}::integer)`;
      await transaction.$queryRaw`SELECT id FROM "RegistroExistencias" WHERE id = ${registroId} AND "clienteId" = ${clienteId} FOR UPDATE`;
      const original = await transaction.registroExistencias.findUnique({
        where: { id: registroId },
        include: { detalles: true, pedidoProduccion: true, corregidoPor: { select: { id: true } }, visitaCliente: true },
      });
      if (!original || original.clienteId !== clienteId) throw new NotFoundException('Registro de existencias no encontrado');
      if (original.corregidoPor) throw new ConflictException('Este levantamiento ya fue corregido. Recarga la información antes de continuar.');
      if (!original.visitaClienteId || !original.visitaCliente ||
          original.visitaCliente.clienteId !== clienteId || original.visitaCliente.repartidorId !== original.repartidorId) {
        throw new ConflictException('Este registro histórico no tiene una visita válida para corregir');
      }
      const operativo = await this.lockAndGetOperativo(transaction, clienteId, original.repartidorId);
      const originalKeys = new Set(original.detalles.map((item) => `${item.saborId}:${item.presentacionId}`));
      const currentKeys = new Set(operativo.map((item) => `${item.saborId}:${item.presentacionId}`));
      if (originalKeys.size !== currentKeys.size || [...originalKeys].some((key) => !currentKeys.has(key))) {
        throw new ConflictException('El surtido operativo cambió. Este levantamiento no puede corregirse sin revisar la configuración.');
      }
      if (keys.length !== originalKeys.size || keys.some((key) => !originalKeys.has(key))) {
        throw new BadRequestException('La corrección debe incluir exactamente las combinaciones del levantamiento original');
      }
      if (original.pedidoProduccion) {
        if (original.pedidoProduccion.estado !== EstadoPedidoProduccion.VIGENTE) {
          throw new ConflictException('El pedido del levantamiento ya fue sustituido');
        }
        await transaction.pedidoProduccion.update({
          where: { id: original.pedidoProduccion.id }, data: { estado: EstadoPedidoProduccion.SUSTITUIDO },
        });
      }
      return this.saveSnapshot(transaction, clienteId, original.repartidorId, original.visitaClienteId,
        data.existencias, operativo, original.id);
    }, { maxWait: 15000, timeout: 15000 });
  }
}
