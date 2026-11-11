import { IsDateString, IsOptional } from 'class-validator';

export class AbastecimientoSucursalesQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  fecha?: string;
}
