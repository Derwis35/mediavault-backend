import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @IsEmail()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  email?: string;

  @IsString()
  @MinLength(4, { message: 'La contraseña debe tener al menos 4 caracteres' })
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName!: string;

  @IsEnum(['admin', 'supervisor', 'operator', 'viewer'])
  role!: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsIn(['cedula', 'placa', 'codigo_unico'])
  idType!: string;

  @IsString()
  @MinLength(4, { message: 'El número de identificación debe tener al menos 4 caracteres' })
  @MaxLength(20)
  idNumber!: string;

  @IsString()
  @MaxLength(150)
  @IsOptional()
  cargo?: string;

  @IsUUID()
  @IsOptional()
  zoneId?: string;

  @IsUUID()
  @IsOptional()
  quadrantId?: string;
}
