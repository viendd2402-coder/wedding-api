import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const CLOUDFLARE_DNS_RECORD_TYPES = [
  'A',
  'AAAA',
  'CNAME',
  'TXT',
] as const;

export type CloudflareDnsRecordType =
  (typeof CLOUDFLARE_DNS_RECORD_TYPES)[number];

export class CreateCloudflareDnsRecordDto {
  @IsIn(CLOUDFLARE_DNS_RECORD_TYPES)
  type!: CloudflareDnsRecordType;

  /** Tên bản ghi trong zone (ví dụ `app` → `app.<zone>`). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  content!: string;

  /** `1` = automatic (theo Cloudflare). Mặc định 1. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  ttl?: number;

  @IsOptional()
  @IsBoolean()
  proxied?: boolean;
}
