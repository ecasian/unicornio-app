import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AbastecimientoSucursalesQueryDto } from './dto.js';
import { AbastecimientoSucursalesService } from './abastecimiento-sucursales.service.js';

@ApiTags('abastecimiento-sucursales')
@Controller('abastecimiento-sucursales')
export class AbastecimientoSucursalesController {
  constructor(private readonly service: AbastecimientoSucursalesService) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Consultar el abastecimiento aprobado y pendiente por fecha operativa' })
  @ApiQuery({ name: 'fecha', required: false, description: 'Fecha operativa YYYY-MM-DD; por defecto, hoy en BUSINESS_TIMEZONE' })
  @ApiOkResponse({ description: 'Detalle por sucursal y consolidado basado solo en la última propuesta confirmada no obsoleta' })
  @ApiBadRequestResponse({ description: 'La fecha debe ser un día calendario válido en formato YYYY-MM-DD' })
  get(@Query() query: AbastecimientoSucursalesQueryDto) {
    return this.service.get(query.fecha);
  }
}
