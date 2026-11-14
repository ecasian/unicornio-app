import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service.js';
import { CreateRepartidorDto } from './dto/create-repartidor.dto.js';
import { UpdateRepartidorDto } from './dto/update-repartidor.dto.js';
import { recordMutationSucceededInTransaction } from '../auth/audit-transaction.js';

@Injectable()
export class RepartidoresService {
  constructor(private readonly prisma: PrismaService) {}

  list(activo?: boolean, id?: number) {
    const where = activo === undefined && id === undefined ? undefined : {
      ...(activo === undefined ? {} : { activo }),
      ...(id === undefined ? {} : { id }),
    };
    return this.prisma.repartidor.findMany({
      where,
      orderBy: { id: 'asc' },
    });
  }

  async get(id: number) {
    const repartidor = await this.prisma.repartidor.findUnique({ where: { id } });
    if (!repartidor) throw new NotFoundException('Repartidor no encontrado');
    return repartidor;
  }

  create(data: CreateRepartidorDto) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.repartidor.create({ data: { nombre: data.nombre, activo: true } });
      await recordMutationSucceededInTransaction(tx);
      return result;
    });
  }

  async update(id: number, data: UpdateRepartidorDto) {
    return this.prisma.$transaction(async (tx) => {
      if (!await tx.repartidor.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Repartidor no encontrado');
      const result = await tx.repartidor.update({ where: { id }, data });
      await recordMutationSucceededInTransaction(tx);
      return result;
    });
  }
}
