import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReplaceStockObjetivoDto } from './dto/replace-stock-objetivo.dto.js';
import { StockObjetivoResponseDto } from './dto/stock-objetivo-response.dto.js';
import { StockObjetivoService } from './stock-objetivo.service.js';

@ApiTags('stock-objetivo')
@ApiBadRequestResponse({ description: 'Combinación inválida, cliente inactivo o cantidad inválida' })
@ApiNotFoundResponse({ description: 'Cliente o sabor no encontrado' })
@Controller('clientes/:clienteId/stock-objetivo')
export class StockObjetivoController {
  constructor(private readonly stockObjetivo: StockObjetivoService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar el stock objetivo configurado del cliente' })
  @ApiOkResponse({ type: StockObjetivoResponseDto, isArray: true })
  get(@Param('clienteId', ParseIntPipe) clienteId: number) {
    return this.stockObjetivo.get(clienteId);
  }

  @Put()
  @ApiOperation({ summary: 'Reemplazar el surtido objetivo completo del cliente' })
  @ApiOkResponse({ type: StockObjetivoResponseDto, isArray: true })
  replace(@Param('clienteId', ParseIntPipe) clienteId: number, @Body() data: ReplaceStockObjetivoDto) {
    return this.stockObjetivo.replace(clienteId, data);
  }
}
