import { ApiProperty } from '@nestjs/swagger';

class PersonaResumenDto {
  @ApiProperty() id!: number;
  @ApiProperty() nombre!: string;
}

class DetalleExistenciasResponseDto {
  @ApiProperty() registroExistenciasId!: number;
  @ApiProperty() saborId!: number;
  @ApiProperty() presentacionId!: number;
  @ApiProperty({ minimum: 0 }) cantidad!: number;
}

class MovimientoResumenDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ['REGISTRO_EXISTENCIAS'] }) tipo!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class RegistroExistenciasResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() clienteId!: number;
  @ApiProperty() repartidorId!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: PersonaResumenDto }) cliente!: PersonaResumenDto;
  @ApiProperty({ type: PersonaResumenDto }) repartidor!: PersonaResumenDto;
  @ApiProperty({ type: [DetalleExistenciasResponseDto] }) detalles!: DetalleExistenciasResponseDto[];
  @ApiProperty({ type: MovimientoResumenDto }) movimiento!: MovimientoResumenDto;
}
