import { Type } from 'class-transformer';
import { IsNotEmpty, ValidateNested } from 'class-validator';
import { CreatePaymentInvitationDto } from './create-payment-invitation.dto';

export class CreateFreeInvitationDto {
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => CreatePaymentInvitationDto)
  invitation!: CreatePaymentInvitationDto;
}
