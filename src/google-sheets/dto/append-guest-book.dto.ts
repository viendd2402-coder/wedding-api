import { Type } from 'class-transformer';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';

export enum GuestBookAppendTab {
  RSVP = 'rsvp',
  WISH = 'wish',
}

export class RsvpRowDto {
  @IsString()
  fullName!: string;

  @IsString()
  phone!: string;

  @IsString()
  guestCount!: string;

  @IsString()
  willAttend!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class WishRowDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsString()
  message!: string;
}

export class AppendGuestBookDto {
  @IsString()
  @IsNotEmpty()
  spreadsheetId!: string;

  @IsEnum(GuestBookAppendTab)
  tab!: GuestBookAppendTab;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RsvpRowDto)
  rsvp?: RsvpRowDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => WishRowDto)
  wish?: WishRowDto;
}
