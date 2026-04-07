import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  type!: number;

  @IsString()
  @IsOptional()
  @MaxLength(3000)
  description?: string;
}
