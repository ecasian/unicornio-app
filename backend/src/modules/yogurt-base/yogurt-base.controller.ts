import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AcondicionarDto, CrearLoteDto, YogurtBaseQueryDto } from './dto.js';
import { YogurtBaseService } from './yogurt-base.service.js';

@ApiTags('yogurt-base')
@Controller('yogurt-base')
export class YogurtBaseController {
  constructor(private readonly service: YogurtBaseService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar lotes, base disponible, acondicionamientos y necesidades de sucursales de referencia' })
  list(@Query() query: YogurtBaseQueryDto) { return this.service.list(query.fecha); }

  @Post('lotes')
  @ApiCreatedResponse({ description: 'Lote nocturno de YogurtBase registrado' })
  createLot(@Body() data: CrearLoteDto) { return this.service.createLot(data); }

  @Post('acondicionamientos')
  @ApiCreatedResponse({ description: 'Movimiento confirmado y persistido de forma transaccional' })
  condition(@Body() data: AcondicionarDto) { return this.service.condition(data); }
}
