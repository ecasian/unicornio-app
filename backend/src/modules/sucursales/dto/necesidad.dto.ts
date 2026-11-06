import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsDateString, IsIn, IsInt, IsPositive, Min, ValidateNested } from 'class-validator';

export class DetalleNecesidadDto {
  @IsInt() @IsPositive() saborId!: number;
  @IsInt() @IsIn([4, 6, 10]) capacidadLitros!: number;
  @IsInt() @Min(0) cantidad!: number;
}

export class GuardarNecesidadDto {
  @IsDateString({ strict: true }) fecha!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DetalleNecesidadDto)
  @ArrayUnique((item: DetalleNecesidadDto) => `${item.saborId}:${item.capacidadLitros}`)
  detalles!: DetalleNecesidadDto[];
}
