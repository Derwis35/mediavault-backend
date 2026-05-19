import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsOptional()
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Debe contener minúscula, mayúscula y número',
  })
  newPassword!: string;

  @IsString()
  @IsOptional()
  confirmPassword?: string;
}
