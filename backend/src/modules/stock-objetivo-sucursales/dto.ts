import { Type } from 'class-transformer';
import { TurnoInventarioSucursal } from '@prisma/client';
import { ArrayUnique, IsArray, IsDateString, IsEnum, IsInt, IsPositive, IsString, Matches, ValidateNested } from 'class-validator';

const LITROS_PATTERN = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;

export class StockObjetivoSucursalItemDto {
  @Type(() => Number) @IsInt() @IsPositive() saborId!: number;
  @IsString() @Matches(LITROS_PATTERN, { message: 'litros debe ser un decimal no negativo de hasta tres posiciones y máximo 11 enteros' }) litros!: string;
}

export class ReemplazarStockObjetivoSucursalDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => StockObjetivoSucursalItemDto)
  @ArrayUnique((item: StockObjetivoSucursalItemDto) => item.saborId, { message: 'No repitas sabores en los objetivos' })
  objetivos!: StockObjetivoSucursalItemDto[];
}

export class ComparacionStockObjetivoSucursalQueryDto {
  @IsDateString({ strict: true }) fecha!: string;
  @IsEnum(TurnoInventarioSucursal) turno!: TurnoInventarioSucursal;
}
