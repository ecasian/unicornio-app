import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, Matches } from 'class-validator';

export class CreateClienteDto {
  @ApiProperty({ example: 'Punto Fresco' })
  @IsString()
  @Matches(/\S/, { message: 'nombre no debe estar vacío' })
  nombre!: string;

  @ApiProperty({ example: '3121234567' })
  @IsString()
  @Matches(/\S/, { message: 'celular no debe estar vacío' })
  celular!: string;

  @ApiProperty({ example: 'Av. Ejemplo 123' })
  @IsString()
  @Matches(/\S/, { message: 'direccion no debe estar vacía' })
  direccion!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  manejaMedioLitro!: boolean;
}
