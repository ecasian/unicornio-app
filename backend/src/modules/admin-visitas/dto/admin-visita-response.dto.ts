import { ApiProperty } from '@nestjs/swagger';

export class AdminVisitaEntidadDto {
  @ApiProperty() id!: number;
  @ApiProperty() nombre!: string;
}

export class AdminVisitaDto {
  @ApiProperty() id!: number;
  @ApiProperty({ format: 'date-time', description: 'Timestamp de llegada original' }) llegadaAt!: Date;
  @ApiProperty({ type: AdminVisitaEntidadDto }) cliente!: AdminVisitaEntidadDto;
  @ApiProperty({ type: AdminVisitaEntidadDto }) repartidor!: AdminVisitaEntidadDto;
}

export class AdminVisitasFiltrosDto {
  @ApiProperty({ nullable: true, type: Number }) clienteId!: number | null;
  @ApiProperty({ nullable: true, type: Number }) repartidorId!: number | null;
}

export class AdminVisitasResponseDto {
  @ApiProperty({ example: '2026-10-07' }) fecha!: string;
  @ApiProperty({ example: 'America/Mexico_City' }) timezone!: string;
  @ApiProperty({ type: AdminVisitasFiltrosDto }) filtros!: AdminVisitasFiltrosDto;
  @ApiProperty({ type: [AdminVisitaDto] }) visitas!: AdminVisitaDto[];
}
