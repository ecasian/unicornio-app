import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service.js';
import { CreateVisitaClienteDto } from './dto/create-visita-cliente.dto.js';

@Injectable()
export class VisitasService {
  constructor(private readonly prisma: PrismaService) {}

  create(clienteId: number, data: CreateVisitaClienteDto) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "Cliente" WHERE id = ${clienteId} FOR SHARE`;
      await transaction.$queryRaw`SELECT id FROM "Repartidor" WHERE id = ${data.repartidorId} FOR SHARE`;

      const cliente = await transaction.cliente.findUnique({ where: { id: clienteId } });
      if (!cliente) throw new NotFoundException('Cliente no encontrado');
      if (!cliente.activo) throw new BadRequestException('El cliente está inactivo');

      const repartidor = await transaction.repartidor.findUnique({ where: { id: data.repartidorId } });
      if (!repartidor) throw new NotFoundException('Repartidor no encontrado');
      if (!repartidor.activo) throw new BadRequestException('El repartidor está inactivo');

      return transaction.visitaCliente.create({
        data: { clienteId, repartidorId: data.repartidorId },
      });
    });
  }
}
