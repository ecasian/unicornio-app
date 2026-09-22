import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, Min, ValidateNested } from 'class-validator';

export class SaborPresentacionStateDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  presentacionId!: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  habilitada!: boolean;
}

export class ReplaceSaborPresentacionesDto {
  @ApiProperty({ type: [SaborPresentacionStateDto], description: 'Estado completo de las dos presentaciones' })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => SaborPresentacionStateDto)
  presentaciones!: SaborPresentacionStateDto[];
}
