import { Module } from '@nestjs/common';
import { StockObjetivoController } from './stock-objetivo.controller.js';
import { StockObjetivoService } from './stock-objetivo.service.js';

@Module({
  controllers: [StockObjetivoController],
  providers: [StockObjetivoService],
})
export class StockObjetivoModule {}
