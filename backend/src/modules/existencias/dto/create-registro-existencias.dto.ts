import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, Max, Min, ValidateNested } from 'class-validator';

export class ExistenciaItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  saborId!: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  presentacionId!: number;

  @ApiProperty({ example: 0, minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  cantidad!: number;
}

export class CreateRegistroExistenciasDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  repartidorId!: number;

  @ApiProperty({ type: [ExistenciaItemDto], description: 'Una fila por cada combinación del surtido operativo actual' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ExistenciaItemDto)
  existencias!: ExistenciaItemDto[];
}
