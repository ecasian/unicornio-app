import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogoService } from './catalogo.service.js';
import { PresentacionResponseDto } from './dto/presentacion-response.dto.js';

@ApiTags('presentaciones')
@Controller('presentaciones')
export class PresentacionesController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar las dos presentaciones del MVP' })
  @ApiOkResponse({ type: PresentacionResponseDto, isArray: true })
  list() {
    return this.catalogo.listPresentaciones();
  }
}
