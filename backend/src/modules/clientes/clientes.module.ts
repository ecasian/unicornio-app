import { Module } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service.js';
import { ClientesController } from './clientes.controller.js';
import { ClientesService } from './clientes.service.js';

@Module({
  controllers: [ClientesController],
  providers: [PrismaService, ClientesService],
})
export class ClientesModule {}
