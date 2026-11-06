import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class SucursalDto {
  @IsString() @Matches(/\S/) nombre!: string;
}

export class UpdateSucursalDto {
  @IsOptional() @IsString() @Matches(/\S/) nombre?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}
