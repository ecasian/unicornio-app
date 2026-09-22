import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service.js';
import { CreateRepartidorDto } from './dto/create-repartidor.dto.js';
import { UpdateRepartidorDto } from './dto/update-repartidor.dto.js';

@Injectable()
export class RepartidoresService {
  constructor(private readonly prisma: PrismaService) {}

  list(activo?: boolean) {
    return this.prisma.repartidor.findMany({
      where: activo === undefined ? undefined : { activo },
      orderBy: { id: 'asc' },
    });
  }

  async get(id: number) {
    const repartidor = await this.prisma.repartidor.findUnique({ where: { id } });
    if (!repartidor) throw new NotFoundException('Repartidor no encontrado');
    return repartidor;
  }

  create(data: CreateRepartidorDto) {
    return this.prisma.repartidor.create({ data: { nombre: data.nombre, activo: true } });
  }

  async update(id: number, data: UpdateRepartidorDto) {
    await this.get(id);
    return this.prisma.repartidor.update({ where: { id }, data });
  }
}
