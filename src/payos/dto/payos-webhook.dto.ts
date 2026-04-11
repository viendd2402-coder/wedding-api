import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class PayosWebhookDto {
  @IsObject()
  data!: Record<string, unknown>;

  @IsString()
  signature!: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  desc?: string;

  @IsBoolean()
  @IsOptional()
  success?: boolean;
}
