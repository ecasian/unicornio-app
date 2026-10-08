import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class ProduccionQueryDto {
  @ApiPropertyOptional({ example: '2026-10-05', description: 'Día calendario local de llegada (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha?: string;
}
