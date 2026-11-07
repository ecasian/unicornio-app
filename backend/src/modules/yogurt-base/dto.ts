import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsPositive, IsUUID, Min } from 'class-validator';

export class CrearLoteDto {
  @IsDateString({ strict: true }) fechaElaboracion!: string;
  @Type(() => Number) @IsInt() @Min(0) cubetas10L!: number;
  @Type(() => Number) @IsInt() @Min(0) cubetas6L!: number;
  @Type(() => Number) @IsInt() @Min(0) cubetas4L!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive() litrosReales!: number;
}

export class AcondicionarDto {
  @Type(() => Number) @IsInt() @IsPositive() loteId!: number;
  @Type(() => Number) @IsInt() @IsPositive() saborId!: number;
  @IsUUID() claveSolicitud!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive() litrosConsumidos!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive() litrosObtenidos!: number;
}

export class YogurtBaseQueryDto {
  @IsDateString({ strict: true }) fecha!: string;
}
