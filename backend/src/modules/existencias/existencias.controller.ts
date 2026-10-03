import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateRegistroExistenciasDto } from './dto/create-registro-existencias.dto.js';
import { RegistroExistenciasResponseDto } from './dto/registro-existencias-response.dto.js';
import { ExistenciasService } from './existencias.service.js';

@ApiTags('registros-existencias')
@Controller('clientes/:clienteId/registros-existencias')
export class ExistenciasController {
  constructor(private readonly existencias: ExistenciasService) {}

  @Post()
  @ApiOperation({ summary: 'Guardar existencias y generar automáticamente un pedido cuando haya faltantes' })
  @ApiCreatedResponse({ type: RegistroExistenciasResponseDto })
  @ApiBadRequestResponse({ description: 'Visita inconsistente, captura incompleta, surtido cambiado o catálogo inactivo' })
  @ApiNotFoundResponse({ description: 'Cliente, repartidor o visita no encontrado' })
  create(@Param('clienteId', ParseIntPipe) clienteId: number, @Body() data: CreateRegistroExistenciasDto) {
    return this.existencias.create(clienteId, data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un registro histórico de existencias' })
  @ApiOkResponse({ type: RegistroExistenciasResponseDto })
  @ApiNotFoundResponse({ description: 'Registro no encontrado para este cliente' })
  get(@Param('clienteId', ParseIntPipe) clienteId: number, @Param('id', ParseIntPipe) id: number) {
    return this.existencias.get(clienteId, id);
  }
}
