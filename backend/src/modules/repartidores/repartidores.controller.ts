import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { RepartidoresService } from './repartidores.service.js';
import { CreateRepartidorDto } from './dto/create-repartidor.dto.js';
import { UpdateRepartidorDto } from './dto/update-repartidor.dto.js';
import { RepartidorResponseDto } from './dto/repartidor-response.dto.js';

class ListRepartidoresQuery {
  @IsOptional()
  @IsIn(['true', 'false'])
  activo?: 'true' | 'false';
}

@ApiTags('repartidores')
@ApiBadRequestResponse({ description: 'Datos inválidos' })
@Controller('repartidores')
export class RepartidoresController {
  constructor(private readonly repartidores: RepartidoresService) {}

  @Get()
  @ApiOperation({ summary: 'Listar repartidores activos e inactivos' })
  @ApiQuery({ name: 'activo', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ description: 'Lista de repartidores', type: RepartidorResponseDto, isArray: true })
  list(@Query() query: ListRepartidoresQuery) {
    return this.repartidores.list(query.activo === undefined ? undefined : query.activo === 'true');
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Repartidor encontrado', type: RepartidorResponseDto })
  @ApiNotFoundResponse({ description: 'Repartidor no encontrado' })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.repartidores.get(id);
  }

  @Post()
  @ApiCreatedResponse({ description: 'Repartidor creado', type: RepartidorResponseDto })
  create(@Body() data: CreateRepartidorDto) {
    return this.repartidores.create(data);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Repartidor actualizado', type: RepartidorResponseDto })
  @ApiNotFoundResponse({ description: 'Repartidor no encontrado' })
  update(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateRepartidorDto) {
    return this.repartidores.update(id, data);
  }
}
