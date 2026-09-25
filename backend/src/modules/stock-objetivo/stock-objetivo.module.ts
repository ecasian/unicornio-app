import { Module } from '@nestjs/common';
import { StockObjetivoController } from './stock-objetivo.controller.js';
import { StockObjetivoService } from './stock-objetivo.service.js';
import { SurtidoOperativoController } from './surtido-operativo.controller.js';

@Module({
  controllers: [StockObjetivoController, SurtidoOperativoController],
  providers: [StockObjetivoService],
  exports: [StockObjetivoService],
})
export class StockObjetivoModule {}
