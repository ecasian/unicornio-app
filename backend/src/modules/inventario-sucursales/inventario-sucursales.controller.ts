import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { CapturaInventarioQueryDto, GuardarInventarioDto, TurnoInventarioQueryDto } from './dto.js';
import { InventarioSucursalesService } from './inventario-sucursales.service.js';

@Controller('inventario-sucursales')
export class InventarioSucursalesController {
  constructor(private readonly service: InventarioSucursalesService) {}

  @Get('captura') captura() { return this.service.captura(); }

  @Get('reporte') reporte(@Query() query: CapturaInventarioQueryDto) {
    return this.service.reporte(query.sucursalId, query.fecha, query.turno);
  }

  @Put('reportes') guardar(@Body() data: GuardarInventarioDto) { return this.service.guardar(data); }

  @Post('reportes/:id/confirmacion') confirmar(@Param('id', ParseIntPipe) id: number) { return this.service.confirmar(id); }

  @Get() consultar(@Query() query: TurnoInventarioQueryDto) { return this.service.consultar(query.fecha, query.turno); }
}
