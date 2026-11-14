import { ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsEmail, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
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
  @IsEmail()
  @MaxLength(254)
  email!: string;
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
