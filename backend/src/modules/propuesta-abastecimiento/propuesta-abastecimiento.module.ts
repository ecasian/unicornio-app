import { Module } from '@nestjs/common';
import { PropuestaAbastecimientoController } from './propuesta-abastecimiento.controller.js';
import { PropuestaAbastecimientoService } from './propuesta-abastecimiento.service.js';

@Module({ controllers: [PropuestaAbastecimientoController], providers: [PropuestaAbastecimientoService] })
export class PropuestaAbastecimientoModule {}
