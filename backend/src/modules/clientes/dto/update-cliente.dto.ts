import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsString, Matches, ValidateIf } from 'class-validator';

export class UpdateClienteDto {
  @ApiPropertyOptional()
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/, { message: 'nombre no debe estar vacío' })
  nombre?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/, { message: 'celular no debe estar vacío' })
  celular?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/, { message: 'direccion no debe estar vacía' })
  direccion?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  manejaMedioLitro?: boolean;

  @ApiPropertyOptional({ example: false })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  activo?: boolean;
}
