import { Body, Controller, Ip, Post, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../../auth/decorators/current-user-id.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { PayosWebhookDto } from '../../../payos/dto/payos-webhook.dto';
import { CreatePaymentLinkDto } from '../../dto/create-payment-link.dto';
import { PayosPaymentGatewayService } from '../../gateways/payos-payment-gateway.service';
import { CreatePaymentLinkResponse } from '../../types/payment.types';

/**
 * Prefix /api/payos/* — luôn PayOS (link + webhook), tương thích client cũ.
 * Tạo link theo env: POST /api/payments/payment-link.
 */
@Controller('payos')
export class PayosLegacyPaymentsController {
  constructor(
    private readonly payosPaymentGateway: PayosPaymentGatewayService,
  ) {}

  @Post('payment-link')
  @UseGuards(JwtAuthGuard)
  createPaymentLink(
    @CurrentUserId() userId: number,
    @Body() dto: CreatePaymentLinkDto,
    @Ip() clientIp: string,
  ): Promise<CreatePaymentLinkResponse> {
    return this.payosPaymentGateway.createPaymentLink(userId, dto, clientIp);
  }

  @Post('webhook')
  webhook(@Body() dto: PayosWebhookDto): Promise<{ received: true }> {
    return this.payosPaymentGateway.processPayosWebhook(dto);
  }
}
