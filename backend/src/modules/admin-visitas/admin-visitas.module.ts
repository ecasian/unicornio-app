import { Module } from '@nestjs/common';
import { AdminVisitasController } from './admin-visitas.controller.js';
import { AdminVisitasService } from './admin-visitas.service.js';

@Module({ controllers: [AdminVisitasController], providers: [AdminVisitasService] })
export class AdminVisitasModule {}
