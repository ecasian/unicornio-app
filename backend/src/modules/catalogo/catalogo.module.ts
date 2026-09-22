import { Module } from '@nestjs/common';
import { CatalogoService } from './catalogo.service.js';
import { PresentacionesController } from './presentaciones.controller.js';
import { SaboresController } from './sabores.controller.js';

@Module({
  controllers: [SaboresController, PresentacionesController],
  providers: [CatalogoService],
})
export class CatalogoModule {}
