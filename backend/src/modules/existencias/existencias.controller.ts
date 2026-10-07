import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateCorreccionExistenciasDto } from './dto/create-correccion-existencias.dto.js';
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

  @Post(':id/correcciones')
  @ApiOperation({ summary: 'Crear una corrección versionada del último registro de existencias' })
  @ApiCreatedResponse({ type: RegistroExistenciasResponseDto })
  @ApiBadRequestResponse({ description: 'Captura incompleta, duplicada o inválida' })
  @ApiConflictResponse({ description: 'Registro ya corregido o surtido operativo cambiado' })
  @ApiNotFoundResponse({ description: 'Registro no encontrado para este cliente' })
  correct(@Param('clienteId', ParseIntPipe) clienteId: number, @Param('id', ParseIntPipe) id: number,
    @Body() data: CreateCorreccionExistenciasDto) {
    return this.existencias.correct(clienteId, id, data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un registro histórico de existencias' })
  @ApiOkResponse({ type: RegistroExistenciasResponseDto })
  @ApiNotFoundResponse({ description: 'Registro no encontrado para este cliente' })
  get(@Param('clienteId', ParseIntPipe) clienteId: number, @Param('id', ParseIntPipe) id: number) {
    return this.existencias.get(clienteId, id);
  }
}
