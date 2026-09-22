import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service.js';
import { CreateClienteDto } from './dto/create-cliente.dto.js';
import { UpdateClienteDto } from './dto/update-cliente.dto.js';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  list(activo?: boolean) {
    return this.prisma.cliente.findMany({
      where: activo === undefined ? undefined : { activo },
      orderBy: { id: 'asc' },
    });
  }

  async get(id: number) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    return cliente;
  }

  create(data: CreateClienteDto) {
    return this.prisma.cliente.create({ data: { ...data, activo: true } });
  }

  async update(id: number, data: UpdateClienteDto) {
    await this.get(id);
    return this.prisma.cliente.update({ where: { id }, data });
  }
}
