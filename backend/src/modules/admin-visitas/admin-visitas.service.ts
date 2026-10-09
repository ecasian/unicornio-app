import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service.js';
import { DEFAULT_BUSINESS_TIMEZONE, resolveBusinessDate } from '../produccion/business-date.js';
import { AdminVisitasQueryDto } from './dto/admin-visitas-query.dto.js';

const visitaSelect = {
  id: true,
  llegadaAt: true,
  cliente: { select: { id: true, nombre: true } },
  repartidor: { select: { id: true, nombre: true } },
} satisfies Prisma.VisitaClienteSelect;

@Injectable()
export class AdminVisitasService {
  private readonly timezone: string;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    this.timezone = config.get<string>('BUSINESS_TIMEZONE')?.trim() || DEFAULT_BUSINESS_TIMEZONE;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: this.timezone });
    } catch {
      throw new Error(`BUSINESS_TIMEZONE no es una zona horaria válida: ${this.timezone}`);
    }
  }

  async get(query: AdminVisitasQueryDto) {
    let window;
    try {
      window = resolveBusinessDate(query.fecha, this.timezone, new Date(), 'today');
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Fecha o zona horaria inválida');
    }

    const visitas = await this.prisma.visitaCliente.findMany({
      where: {
        llegadaAt: { gte: window.start, lt: window.end },
        ...(query.clienteId === undefined ? {} : { clienteId: query.clienteId }),
        ...(query.repartidorId === undefined ? {} : { repartidorId: query.repartidorId }),
      },
      select: visitaSelect,
      orderBy: [{ llegadaAt: 'desc' }, { id: 'desc' }],
    });

    return {
      fecha: window.fecha,
      timezone: window.timezone,
      filtros: { clienteId: query.clienteId ?? null, repartidorId: query.repartidorId ?? null },
      visitas,
    };
  }
}
