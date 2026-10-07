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
  @ApiProperty({ type: PersonaResumenDto }) sabor!: PersonaResumenDto;
  @ApiProperty({ type: PersonaResumenDto }) presentacion!: PersonaResumenDto;
}

class MovimientoResumenDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ['REGISTRO_EXISTENCIAS', 'PEDIDO_PRODUCCION'] }) tipo!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

class DetallePedidoResponseDto {
  @ApiProperty() pedidoProduccionId!: number;
  @ApiProperty() saborId!: number;
  @ApiProperty() presentacionId!: number;
  @ApiProperty({ minimum: 0 }) cantidadSugerida!: number;
  @ApiProperty({ minimum: 0 }) cantidadSolicitada!: number;
  @ApiProperty({ type: PersonaResumenDto }) sabor!: PersonaResumenDto;
  @ApiProperty({ type: PersonaResumenDto }) presentacion!: PersonaResumenDto;
}

class PedidoProduccionResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() clienteId!: number;
  @ApiProperty() repartidorId!: number;
  @ApiProperty() registroExistenciasId!: number;
  @ApiProperty({ enum: ['VIGENTE', 'SUSTITUIDO'] }) estado!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: [DetallePedidoResponseDto] }) detalles!: DetallePedidoResponseDto[];
  @ApiProperty({ type: MovimientoResumenDto }) movimiento!: MovimientoResumenDto;
}

export class RegistroExistenciasResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() clienteId!: number;
  @ApiProperty() repartidorId!: number;
  @ApiProperty({ nullable: true, description: 'Nulo solo para registros anteriores a VisitaCliente' }) visitaClienteId!: number | null;
  @ApiProperty({ nullable: true }) corrigeRegistroExistenciasId!: number | null;
  @ApiProperty({ nullable: true }) corregidoPorRegistroExistenciasId!: number | null;
  @ApiProperty() vigente!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: PersonaResumenDto }) cliente!: PersonaResumenDto;
  @ApiProperty({ type: PersonaResumenDto }) repartidor!: PersonaResumenDto;
  @ApiProperty({ type: [DetalleExistenciasResponseDto] }) detalles!: DetalleExistenciasResponseDto[];
  @ApiProperty({ type: MovimientoResumenDto }) movimiento!: MovimientoResumenDto;
  @ApiProperty({ type: PedidoProduccionResponseDto, nullable: true,
    description: 'Nulo cuando ninguna combinación requiere producción o en registros históricos previos' })
  pedidoProduccion!: PedidoProduccionResponseDto | null;
  @ApiProperty({ description: 'Indica si se generó automáticamente un pedido' }) requiereProduccion!: boolean;
}
