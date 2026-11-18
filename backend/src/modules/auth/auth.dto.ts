import { Transform } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, Matches, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MaxLength(254)
  username!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim().replace(/[A-Z]/g, (c: string) => c.toLowerCase()) : value)
  @Matches(/^[a-z0-9._-]{3,40}$/)
  username!: string;
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  roles!: string[];
  @IsOptional()
  @IsInt()
  repartidorId?: number;
}

export class SetActiveDto {
  @IsBoolean()
  activo!: boolean;
}

export class SetRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  roles!: string[];
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
