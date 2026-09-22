import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsString, Matches, ValidateIf } from 'class-validator';

export class UpdateRepartidorDto {
  @ApiPropertyOptional()
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/, { message: 'nombre no debe estar vacío' })
  nombre?: string;

  @ApiPropertyOptional({ example: false })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  activo?: boolean;
}
