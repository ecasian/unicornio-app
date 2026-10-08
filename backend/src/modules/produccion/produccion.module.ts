import { Module } from '@nestjs/common';
import { ProduccionController } from './produccion.controller.js';
import { ProduccionService } from './produccion.service.js';

@Module({ controllers: [ProduccionController], providers: [ProduccionService] })
export class ProduccionModule {}
