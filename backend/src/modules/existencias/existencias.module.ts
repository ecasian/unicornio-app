import { Module } from '@nestjs/common';
import { StockObjetivoModule } from '../stock-objetivo/stock-objetivo.module.js';
import { ExistenciasController } from './existencias.controller.js';
import { ExistenciasService } from './existencias.service.js';

@Module({
  imports: [StockObjetivoModule],
  controllers: [ExistenciasController],
  providers: [ExistenciasService],
})
export class ExistenciasModule {}
