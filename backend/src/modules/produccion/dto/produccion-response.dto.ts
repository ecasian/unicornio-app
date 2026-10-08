import { ApiProperty } from '@nestjs/swagger';

class ProduccionProductoDto {
  @ApiProperty() saborId!: number;
  @ApiProperty() sabor!: string;
  @ApiProperty() presentacionId!: number;
  @ApiProperty() presentacion!: string;
  @ApiProperty({ description: 'Cantidad solicitada en el pedido vigente' }) cantidad!: number;
}

class ProduccionPedidoDto {
  @ApiProperty() pedidoProduccionId!: number;
  @ApiProperty() registroExistenciasId!: number;
  @ApiProperty() visitaClienteId!: number;
  @ApiProperty() llegadaAt!: Date;
  @ApiProperty() repartidorId!: number;
  @ApiProperty() repartidor!: string;
  @ApiProperty({ type: [ProduccionProductoDto] }) detalles!: ProduccionProductoDto[];
}

class ProduccionTiendaDto {
  @ApiProperty() clienteId!: number;
  @ApiProperty() cliente!: string;
  @ApiProperty({ type: [ProduccionPedidoDto] }) pedidos!: ProduccionPedidoDto[];
}

export class ProduccionResponseDto {
  @ApiProperty({ example: '2026-10-05' }) fecha!: string;
  @ApiProperty({ example: 'America/Mexico_City' }) timezone!: string;
  @ApiProperty({ type: [ProduccionTiendaDto] }) tiendas!: ProduccionTiendaDto[];
  @ApiProperty({ type: [ProduccionProductoDto] }) consolidado!: ProduccionProductoDto[];
}
