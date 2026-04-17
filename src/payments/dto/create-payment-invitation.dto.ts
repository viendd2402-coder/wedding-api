import { Transform } from 'class-transformer';
import {
  Allow,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { INVITATION_TEMPLATE_SLUGS } from '../invitation-templates.catalog';

export class CreatePaymentInvitationDto {
  @IsNotEmpty()
  @IsString()
  @IsIn([...INVITATION_TEMPLATE_SLUGS])
  @MaxLength(120)
  templateSlug!: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  brideName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  groomName!: string;

  @IsNotEmpty()
  @IsDateString()
  weddingDate!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  venue!: string;

  @IsOptional()
  @Allow()
  details?: unknown;

  /** Key S3 hoặc URL ảnh đại diện. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  thumbnailImage?: string | null;

  /** Tùy chọn: nhãn subdomain (chữ thường, số, gạch giữa). Kiểm tra trùng khi tạo link / thiệc miễn phí. */
  @IsOptional()
  @IsString()
  @MaxLength(63)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  subdomain?: string;
}
