import { Controller, Get, Param, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import {
  InviteSubdomainAvailabilityResponse,
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

  @Get('check-subdomain')
  checkInviteSubdomain(
    @Query('subdomain') subdomain?: string,
  ): Promise<InviteSubdomainAvailabilityResponse> {
    return this.paymentsService.getInviteSubdomainAvailability(subdomain ?? '');
  }

  /** Chi tiết thiệp theo nhãn subdomain (đã chuẩn hóa). Đặt trước `:code`. */
  @Get('by-subdomain/:subdomain')
  getInvitationBySubdomain(
    @Param('subdomain') subdomain: string,
  ): Promise<PublicInvitationDetailsByCodeResponse> {
    return this.paymentsService.getPublicInvitationDetailsBySubdomain(subdomain);
  }

  @Get(':code')
  getInvitationByCode(
    @Param('code') code: string,
  ): Promise<PublicInvitationDetailsByCodeResponse> {
    return this.paymentsService.getPublicInvitationDetailsByCode(code);
  }
}
