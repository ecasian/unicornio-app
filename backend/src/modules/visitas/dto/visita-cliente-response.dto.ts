import { ApiProperty } from '@nestjs/swagger';

export class VisitaClienteResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() clienteId!: number;
  @ApiProperty() repartidorId!: number;
  @ApiProperty({ type: String, format: 'date-time' }) llegadaAt!: Date;
}
