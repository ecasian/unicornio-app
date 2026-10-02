import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateVisitaClienteDto } from './dto/create-visita-cliente.dto.js';
import { VisitaClienteResponseDto } from './dto/visita-cliente-response.dto.js';
import { VisitasService } from './visitas.service.js';

@ApiTags('visitas-cliente')
@Controller('clientes/:clienteId/visitas')
export class VisitasController {
  constructor(private readonly visitas: VisitasService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar la llegada a un cliente' })
  @ApiCreatedResponse({ type: VisitaClienteResponseDto })
  @ApiBadRequestResponse({ description: 'Cliente o repartidor inactivo, o payload inválido' })
  @ApiNotFoundResponse({ description: 'Cliente o repartidor no encontrado' })
  create(@Param('clienteId', ParseIntPipe) clienteId: number, @Body() data: CreateVisitaClienteDto) {
    return this.visitas.create(clienteId, data);
  }
}
