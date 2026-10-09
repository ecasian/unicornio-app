import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';

export class AdminVisitasQueryDto {
  @ApiPropertyOptional({ example: '2026-10-07', description: 'Día calendario de llegada en BUSINESS_TIMEZONE; por defecto, hoy' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha?: string;

  @ApiPropertyOptional({ minimum: 1, type: Number })
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value)
  @IsInt()
  @Min(1)
  clienteId?: number;

  @ApiPropertyOptional({ minimum: 1, type: Number })
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value)
  @IsInt()
  @Min(1)
  repartidorId?: number;
}
