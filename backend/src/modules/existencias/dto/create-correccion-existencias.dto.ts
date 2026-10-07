import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { ExistenciaItemDto } from './create-registro-existencias.dto.js';

export class CreateCorreccionExistenciasDto {
  @ApiProperty({ type: [ExistenciaItemDto], description: 'Las mismas combinaciones del registro corregido' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ExistenciaItemDto)
  existencias!: ExistenciaItemDto[];
}
