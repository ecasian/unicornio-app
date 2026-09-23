import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StockObjetivoResponseDto } from './dto/stock-objetivo-response.dto.js';
import { StockObjetivoService } from './stock-objetivo.service.js';

@ApiTags('stock-objetivo')
@Controller('clientes/:clienteId/surtido-operativo')
export class SurtidoOperativoController {
  constructor(private readonly stockObjetivo: StockObjetivoService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar el surtido actualmente operable del cliente' })
  @ApiOkResponse({ type: StockObjetivoResponseDto, isArray: true })
  @ApiBadRequestResponse({ description: 'El cliente está inactivo' })
  @ApiNotFoundResponse({ description: 'Cliente no encontrado' })
  get(@Param('clienteId', ParseIntPipe) clienteId: number) {
    return this.stockObjetivo.getOperativo(clienteId);
  }
}
