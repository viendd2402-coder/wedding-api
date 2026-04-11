import { Controller, Get, Param } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PublicInvitationDetailsByCodeResponse } from './types/payment.types';

@Controller('invites')
export class PaymentInvitationPublicController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get(':code')
  getInvitationByCode(
    @Param('code') code: string,
  ): Promise<PublicInvitationDetailsByCodeResponse> {
    return this.paymentsService.getPublicInvitationDetailsByCode(code);
  }
}
