import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../modules/auth/auth.security.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiOkResponse({
    schema: {
      example: { status: 'ok' },
    },
  })
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
