import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { CreatePaymentInvitationDto } from './create-payment-invitation.dto';

export class CreatePaymentLinkDto {
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => CreatePaymentInvitationDto)
  invitation!: CreatePaymentInvitationDto;
}
