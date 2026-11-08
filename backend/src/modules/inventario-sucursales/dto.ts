import { Type } from 'class-transformer';
import { TurnoInventarioSucursal } from '@prisma/client';
import { ArrayUnique, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsPositive, IsString, Matches, ValidateNested } from 'class-validator';

export class FechaInventarioQueryDto {
  @IsDateString({ strict: true }) fecha!: string;
}

export class FechaInventarioOpcionalQueryDto {
  @IsOptional() @IsDateString({ strict: true }) fecha?: string;
}

export class TurnoInventarioQueryDto {
  @IsEnum(TurnoInventarioSucursal) turno!: TurnoInventarioSucursal;
  @IsOptional() @IsDateString({ strict: true }) fecha?: string;
}

export class CapturaInventarioQueryDto extends FechaInventarioQueryDto {
  @Type(() => Number) @IsInt() @IsPositive() sucursalId!: number;
  @IsEnum(TurnoInventarioSucursal) turno!: TurnoInventarioSucursal;
}

export class DetalleInventarioDto {
  @Type(() => Number) @IsInt() @IsPositive() saborId!: number;
  @IsString() @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/, { message: 'litros debe ser un decimal no negativo de hasta tres posiciones' }) litros!: string;
}

export class GuardarInventarioDto extends FechaInventarioQueryDto {
  @Type(() => Number) @IsInt() @IsPositive() sucursalId!: number;
  @IsEnum(TurnoInventarioSucursal) turno!: TurnoInventarioSucursal;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DetalleInventarioDto)
  @ArrayUnique((item: DetalleInventarioDto) => item.saborId, { message: 'No repitas sabores en el reporte' })
  detalles!: DetalleInventarioDto[];
}
