import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { IsDateString, IsOptional } from 'class-validator';
import { GuardarNecesidadDto } from './dto/necesidad.dto.js';
import { SucursalDto, UpdateSucursalDto } from './dto/sucursal.dto.js';
import { SucursalesService } from './sucursales.service.js';

class FechaQuery { @IsDateString({ strict: true }) fecha!: string; }
class FechaOpcionalQuery { @IsOptional() @IsDateString({ strict: true }) fecha?: string; }

@Controller()
export class SucursalesController {
  constructor(private readonly service: SucursalesService) {}

  @Get('sucursales') list() { return this.service.listSucursales(); }
  @Get('sucursales/sabores') listSabores() { return this.service.listSabores(); }
  @Post('sucursales') create(@Body() data: SucursalDto) { return this.service.createSucursal(data); }
  @Patch('sucursales/:id') update(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateSucursalDto) { return this.service.updateSucursal(id, data); }
  @Put('sucursales/:id/necesidades') guardar(@Param('id', ParseIntPipe) id: number, @Body() data: GuardarNecesidadDto) { return this.service.guardarNecesidad(id, data); }
  @Post('sucursales/:id/necesidades/confirmacion') confirmar(@Param('id', ParseIntPipe) id: number, @Query() query: FechaQuery) { return this.service.confirmar(id, query.fecha); }
  @Get('concentrado-sucursales') consultar(@Query() query: FechaOpcionalQuery) { return this.service.consultar(query.fecha); }
}
