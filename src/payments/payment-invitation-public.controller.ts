import { Controller, Get, Param, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import {
  PopularInvitationTemplatesResponse,
  PublicInvitationDetailsByCodeResponse,
} from './types/payment.types';

@Controller('invites')
export class PaymentInvitationPublicController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Đặt trước `:code` để không match nhầm `popular` thành mã thiệp. */
  @Get('popular')
  getPopularInvitationTemplates(
    @Query('limit') limit?: string,
  ): Promise<PopularInvitationTemplatesResponse> {
    return this.paymentsService.getTopInvitationTemplatesByUsage(limit);
  }

  @Get(':code')
  getInvitationByCode(
    @Param('code') code: string,
  ): Promise<PublicInvitationDetailsByCodeResponse> {
    return this.paymentsService.getPublicInvitationDetailsByCode(code);
  }
}
