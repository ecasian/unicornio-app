import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { CrearPropuestaDto, ListarPropuestasQueryDto, ReemplazarDecisionesDto } from './dto.js';
import { PropuestaAbastecimientoService } from './propuesta-abastecimiento.service.js';

@Controller('propuestas-abastecimiento')
export class PropuestaAbastecimientoController {
  constructor(private readonly service: PropuestaAbastecimientoService) {}

  @Get() listar(@Query() query: ListarPropuestasQueryDto) { return this.service.listar(query.fecha); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.service.get(id); }
  @Post() crear(@Body() body: CrearPropuestaDto) { return this.service.crear(body.sucursalId, body.fecha); }
  @Put(':id/decisiones') decidir(@Param('id', ParseIntPipe) id: number, @Body() body: ReemplazarDecisionesDto) { return this.service.decidir(id, body.decisiones); }
  @Post(':id/recalcular') recalcular(@Param('id', ParseIntPipe) id: number) { return this.service.recalcular(id); }
  @Post(':id/confirmacion') confirmar(@Param('id', ParseIntPipe) id: number) { return this.service.confirmar(id); }
}
