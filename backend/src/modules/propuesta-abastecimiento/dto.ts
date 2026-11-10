import { ArrayUnique, IsArray, IsDateString, IsInt, IsString, Matches, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CrearPropuestaDto {
  @IsInt() @Min(1) sucursalId!: number;
  @IsDateString({ strict: true }) fecha!: string;
}

export class ListarPropuestasQueryDto {
  @IsDateString({ strict: true }) fecha!: string;
}

export class GuardarDecisionesDto {
  @IsInt() @Min(1) saborId!: number;
  @ValidateIf((_item, value) => value !== null) @IsString() @Matches(/^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/) decisionLitros!: string | null;
}

export class ReemplazarDecisionesDto {
  @IsArray() @ArrayUnique((item: GuardarDecisionesDto) => item.saborId) @ValidateNested({ each: true }) @Type(() => GuardarDecisionesDto)
  decisiones!: GuardarDecisionesDto[];
}
