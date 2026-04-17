import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { INVITATION_TEMPLATE_SLUGS } from '../invitation-templates.catalog';

export class PaymentInvitationAlbumItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  storageKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number | null;
}

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentInvitationAlbumItemDto)
  album?: PaymentInvitationAlbumItemDto[] | null;

  /** Tùy chọn: nhãn subdomain (chữ thường, số, gạch giữa). Kiểm tra trùng khi tạo link / thiệp miễn phí. */
  @IsOptional()
  @IsString()
  @MaxLength(63)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  subdomain?: string;
}
