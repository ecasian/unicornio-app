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
  @ApiOperation({ summary: 'Guardar un snapshot completo de existencias y su movimiento de bitácora' })
  @ApiCreatedResponse({ type: RegistroExistenciasResponseDto })
  @ApiBadRequestResponse({ description: 'Captura incompleta, surtido cambiado o catálogo inactivo' })
  @ApiNotFoundResponse({ description: 'Cliente o repartidor no encontrado' })
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
