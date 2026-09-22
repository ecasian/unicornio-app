import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class CreateSaborDto {
  @ApiProperty({ example: 'Fresa' })
  @IsString()
  @Matches(/\S/, { message: 'nombre no debe estar vacío' })
  nombre!: string;
}
