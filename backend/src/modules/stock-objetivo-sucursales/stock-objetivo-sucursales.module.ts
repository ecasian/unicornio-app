import { Module } from '@nestjs/common';
import { StockObjetivoSucursalesController } from './stock-objetivo-sucursales.controller.js';
import { StockObjetivoSucursalesService } from './stock-objetivo-sucursales.service.js';

@Module({ controllers: [StockObjetivoSucursalesController], providers: [StockObjetivoSucursalesService] })
export class StockObjetivoSucursalesModule {}
