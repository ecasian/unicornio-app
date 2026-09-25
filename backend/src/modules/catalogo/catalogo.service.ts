import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service.js';
import { CreateSaborDto } from './dto/create-sabor.dto.js';
import { ReplaceSaborPresentacionesDto } from './dto/replace-sabor-presentaciones.dto.js';
import { UpdateSaborDto } from './dto/update-sabor.dto.js';

@Injectable()
export class CatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  listSabores(activo?: boolean) {
    return this.prisma.sabor.findMany({
      where: activo === undefined ? undefined : { activo },
      orderBy: { id: 'asc' },
    });
  }

  async getSabor(id: number) {
    const sabor = await this.prisma.sabor.findUnique({ where: { id } });
    if (!sabor) throw new NotFoundException('Sabor no encontrado');
    return sabor;
  }

  createSabor(data: CreateSaborDto) {
    return this.prisma.sabor.create({ data: { nombre: data.nombre, activo: true } });
  }

  async updateSabor(id: number, data: UpdateSaborDto) {
    await this.getSabor(id);
    return this.prisma.sabor.update({ where: { id }, data });
  }

  listPresentaciones() {
    return this.prisma.presentacion.findMany({ orderBy: { id: 'asc' } });
  }

  async getSaborPresentaciones(id: number) {
    await this.getSabor(id);
    const presentaciones = await this.prisma.presentacion.findMany({
      orderBy: { id: 'asc' },
      include: { sabores: { where: { saborId: id } } },
    });
    return presentaciones.map(({ id: presentacionId, nombre, litrosEquivalentes, sabores }) => ({
      presentacionId,
      nombre,
      litrosEquivalentes,
      habilitada: sabores[0]?.habilitada ?? false,
    }));
  }

  async replaceSaborPresentaciones(id: number, data: ReplaceSaborPresentacionesDto) {
    await this.getSabor(id);
    const presentaciones = await this.listPresentaciones();
    const ids = new Set(data.presentaciones.map((item) => item.presentacionId));
    if (data.presentaciones.length !== presentaciones.length || ids.size !== presentaciones.length ||
        presentaciones.some(({ id: presentacionId }) => !ids.has(presentacionId))) {
      throw new BadRequestException('Envía una vez cada presentación existente');
    }

    await this.prisma.$transaction(async (transaction) => {
      for (const { presentacionId, habilitada } of [...data.presentaciones].sort((a, b) => a.presentacionId - b.presentacionId)) {
        await transaction.saborPresentacion.upsert({
          where: { saborId_presentacionId: { saborId: id, presentacionId } },
          create: { saborId: id, presentacionId, habilitada },
          update: { habilitada },
        });
      }
    });
    return this.getSaborPresentaciones(id);
  }
}
