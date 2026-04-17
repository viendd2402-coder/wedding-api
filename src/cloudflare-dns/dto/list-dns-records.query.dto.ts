import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CLOUDFLARE_DNS_RECORD_TYPES } from './create-dns-record.dto';

export class ListCloudflareDnsRecordsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsIn(CLOUDFLARE_DNS_RECORD_TYPES)
  type?: (typeof CLOUDFLARE_DNS_RECORD_TYPES)[number];
}
