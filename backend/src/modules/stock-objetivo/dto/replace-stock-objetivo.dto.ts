import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, Max, Min, ValidateNested } from 'class-validator';

export class StockObjetivoItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  saborId!: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  presentacionId!: number;

  @ApiProperty({ example: 0, minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  cantidad!: number;
}

export class ReplaceStockObjetivoDto {
  @ApiProperty({ type: [StockObjetivoItemDto], description: 'Surtido objetivo completo; [] deja el cliente sin stock configurado' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockObjetivoItemDto)
  combinaciones!: StockObjetivoItemDto[];
}
