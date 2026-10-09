import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminVisitasQueryDto } from './dto/admin-visitas-query.dto.js';
import { AdminVisitasResponseDto } from './dto/admin-visita-response.dto.js';
import { AdminVisitasService } from './admin-visitas.service.js';

@ApiTags('admin-visitas')
@Controller('admin/visitas')
export class AdminVisitasController {
  constructor(private readonly adminVisitas: AdminVisitasService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar llegadas registradas (solo lectura)',
    description: 'La fecha usa el día calendario de BUSINESS_TIMEZONE; por defecto es hoy. Los filtros son opcionales y las visitas históricas incluyen clientes y repartidores inactivos.',
  })
  @ApiQuery({ name: 'fecha', required: false, example: '2026-10-07', description: 'Día calendario local YYYY-MM-DD; por defecto hoy en BUSINESS_TIMEZONE' })
  @ApiQuery({ name: 'clienteId', required: false, type: Number })
  @ApiQuery({ name: 'repartidorId', required: false, type: Number })
  @ApiOkResponse({ type: AdminVisitasResponseDto })
  @ApiBadRequestResponse({ description: 'Fecha o filtros numéricos inválidos' })
  get(@Query() query: AdminVisitasQueryDto) {
    return this.adminVisitas.get(query);
  }
}
