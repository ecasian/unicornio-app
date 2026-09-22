import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class CreateRepartidorDto {
  @ApiProperty({ example: 'María López' })
  @IsString()
  @Matches(/\S/, { message: 'nombre no debe estar vacío' })
  nombre!: string;
}
