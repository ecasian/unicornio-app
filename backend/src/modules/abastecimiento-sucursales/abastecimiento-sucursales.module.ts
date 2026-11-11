import { Module } from '@nestjs/common';
import { AbastecimientoSucursalesController } from './abastecimiento-sucursales.controller.js';
import { AbastecimientoSucursalesService } from './abastecimiento-sucursales.service.js';

@Module({ controllers: [AbastecimientoSucursalesController], providers: [AbastecimientoSucursalesService] })
export class AbastecimientoSucursalesModule {}
