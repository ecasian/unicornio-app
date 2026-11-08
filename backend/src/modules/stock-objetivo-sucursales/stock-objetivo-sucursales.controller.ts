import { Body, Controller, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { ComparacionStockObjetivoSucursalQueryDto, ReemplazarStockObjetivoSucursalDto } from './dto.js';
import { StockObjetivoSucursalesService } from './stock-objetivo-sucursales.service.js';

@Controller('sucursales/:id/stock-objetivo')
export class StockObjetivoSucursalesController {
  constructor(private readonly service: StockObjetivoSucursalesService) {}

  @Get() get(@Param('id', ParseIntPipe) id: number) { return this.service.get(id); }

  @Put() replace(@Param('id', ParseIntPipe) id: number, @Body() data: ReemplazarStockObjetivoSucursalDto) {
    return this.service.replace(id, data);
  }

  @Get('comparacion') compare(@Param('id', ParseIntPipe) id: number, @Query() query: ComparacionStockObjetivoSucursalQueryDto) {
    return this.service.compare(id, query.fecha, query.turno);
  }
}
