import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class SocialLoginDto {
  @IsString()
  @IsIn(['google', 'facebook'])
  provider!: 'google' | 'facebook';

  @IsString()
  @IsNotEmpty()
  token!: string;
}
