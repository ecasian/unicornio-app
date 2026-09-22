import { ApiProperty } from '@nestjs/swagger';

export class PresentacionResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() nombre!: string;
  @ApiProperty({ example: 0.5 }) litrosEquivalentes!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class SaborPresentacionResponseDto {
  @ApiProperty() presentacionId!: number;
  @ApiProperty() nombre!: string;
  @ApiProperty({ example: 0.5 }) litrosEquivalentes!: number;
  @ApiProperty() habilitada!: boolean;
}
