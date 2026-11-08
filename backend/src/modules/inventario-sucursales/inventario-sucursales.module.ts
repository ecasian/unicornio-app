import { Module } from '@nestjs/common';
import { InventarioSucursalesController } from './inventario-sucursales.controller.js';
import { InventarioSucursalesService } from './inventario-sucursales.service.js';

@Module({ controllers: [InventarioSucursalesController], providers: [InventarioSucursalesService] })
export class InventarioSucursalesModule {}
