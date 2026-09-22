import { ApiProperty } from '@nestjs/swagger';

export class ClienteResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() nombre!: string;
  @ApiProperty() celular!: string;
  @ApiProperty() direccion!: string;
  @ApiProperty() manejaMedioLitro!: boolean;
  @ApiProperty() activo!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}
