import { ApiProperty } from '@nestjs/swagger';

class SaborStockDto {
  @ApiProperty() id!: number;
  @ApiProperty() nombre!: string;
  @ApiProperty() activo!: boolean;
}

class PresentacionStockDto {
  @ApiProperty() id!: number;
  @ApiProperty() nombre!: string;
  @ApiProperty({ example: 0.5 }) litrosEquivalentes!: number;
}

export class StockObjetivoResponseDto {
  @ApiProperty() clienteId!: number;
  @ApiProperty() saborId!: number;
  @ApiProperty() presentacionId!: number;
  @ApiProperty({ minimum: 0 }) cantidad!: number;
  @ApiProperty({ type: SaborStockDto }) sabor!: SaborStockDto;
  @ApiProperty({ type: PresentacionStockDto }) presentacion!: PresentacionStockDto;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}
