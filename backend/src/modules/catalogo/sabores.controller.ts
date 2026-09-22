import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CatalogoService } from './catalogo.service.js';
import { CreateSaborDto } from './dto/create-sabor.dto.js';
import { SaborPresentacionResponseDto } from './dto/presentacion-response.dto.js';
import { ReplaceSaborPresentacionesDto } from './dto/replace-sabor-presentaciones.dto.js';
import { SaborResponseDto } from './dto/sabor-response.dto.js';
import { UpdateSaborDto } from './dto/update-sabor.dto.js';

class ListSaboresQuery {
  @IsOptional()
  @IsIn(['true', 'false'])
  activo?: 'true' | 'false';
}

@ApiTags('sabores')
@ApiBadRequestResponse({ description: 'Datos inválidos' })
@Controller('sabores')
export class SaboresController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar sabores activos e inactivos' })
  @ApiQuery({ name: 'activo', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ type: SaborResponseDto, isArray: true })
  list(@Query() query: ListSaboresQuery) {
    return this.catalogo.listSabores(query.activo === undefined ? undefined : query.activo === 'true');
  }

  @Get(':id')
  @ApiOkResponse({ type: SaborResponseDto })
  @ApiNotFoundResponse({ description: 'Sabor no encontrado' })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.catalogo.getSabor(id);
  }

  @Post()
  @ApiCreatedResponse({ type: SaborResponseDto })
  create(@Body() data: CreateSaborDto) {
    return this.catalogo.createSabor(data);
  }

  @Patch(':id')
  @ApiOkResponse({ type: SaborResponseDto })
  @ApiNotFoundResponse({ description: 'Sabor no encontrado' })
  update(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateSaborDto) {
    return this.catalogo.updateSabor(id, data);
  }

  @Get(':id/presentaciones')
  @ApiOperation({ summary: 'Consultar habilitación de cada presentación del sabor' })
  @ApiOkResponse({ type: SaborPresentacionResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Sabor no encontrado' })
  getPresentaciones(@Param('id', ParseIntPipe) id: number) {
    return this.catalogo.getSaborPresentaciones(id);
  }

  @Put(':id/presentaciones')
  @ApiOperation({ summary: 'Guardar el estado completo de las dos presentaciones del sabor' })
  @ApiOkResponse({ type: SaborPresentacionResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Sabor no encontrado' })
  replacePresentaciones(@Param('id', ParseIntPipe) id: number, @Body() data: ReplaceSaborPresentacionesDto) {
    return this.catalogo.replaceSaborPresentaciones(id, data);
  }
}
