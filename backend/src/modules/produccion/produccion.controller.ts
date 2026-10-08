import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProduccionQueryDto } from './dto/produccion-query.dto.js';
import { ProduccionResponseDto } from './dto/produccion-response.dto.js';
import { ProduccionService } from './produccion.service.js';

@ApiTags('produccion')
@Controller('produccion')
export class ProduccionController {
  constructor(private readonly produccion: ProduccionService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar pedidos vigentes por día local de llegada del repartidor' })
  @ApiQuery({ name: 'fecha', required: false, description: 'Día de llegada YYYY-MM-DD; por defecto, ayer en BUSINESS_TIMEZONE' })
  @ApiOkResponse({ type: ProduccionResponseDto, description: 'Detalle por tienda y consolidado derivados de los mismos pedidos vigentes' })
  @ApiBadRequestResponse({ description: 'La fecha debe ser un día calendario válido en formato YYYY-MM-DD' })
  get(@Query() query: ProduccionQueryDto) {
    return this.produccion.get(query.fecha);
  }
}
