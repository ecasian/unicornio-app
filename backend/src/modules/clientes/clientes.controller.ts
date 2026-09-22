import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ClientesService } from './clientes.service.js';
import { ClienteResponseDto } from './dto/cliente-response.dto.js';
import { CreateClienteDto } from './dto/create-cliente.dto.js';
import { UpdateClienteDto } from './dto/update-cliente.dto.js';

class ListClientesQuery {
  @IsOptional()
  @IsIn(['true', 'false'])
  activo?: 'true' | 'false';
}

@ApiTags('clientes')
@ApiBadRequestResponse({ description: 'Datos inválidos' })
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar clientes activos e inactivos' })
  @ApiQuery({ name: 'activo', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ description: 'Lista de clientes', type: ClienteResponseDto, isArray: true })
  list(@Query() query: ListClientesQuery) {
    return this.clientes.list(query.activo === undefined ? undefined : query.activo === 'true');
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Cliente encontrado', type: ClienteResponseDto })
  @ApiNotFoundResponse({ description: 'Cliente no encontrado' })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.clientes.get(id);
  }

  @Post()
  @ApiCreatedResponse({ description: 'Cliente creado', type: ClienteResponseDto })
  create(@Body() data: CreateClienteDto) {
    return this.clientes.create(data);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Cliente actualizado', type: ClienteResponseDto })
  @ApiNotFoundResponse({ description: 'Cliente no encontrado' })
  update(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateClienteDto) {
    return this.clientes.update(id, data);
  }
}
