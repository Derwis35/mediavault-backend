import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateEtiquetaDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  clasificacionId!: string;
}
