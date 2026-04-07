import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(255)
  @IsNotEmpty()
  password!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(255)
  @IsNotEmpty()
  passwordConfirmation!: string;
}
