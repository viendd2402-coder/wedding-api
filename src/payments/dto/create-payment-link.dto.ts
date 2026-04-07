import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CreatePaymentLinkDto {
  @IsInt()
  @Min(1000)
  @IsNotEmpty()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description!: string;
}
