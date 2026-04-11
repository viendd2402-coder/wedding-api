import { Body, Controller, Post } from '@nestjs/common';
import { PayosWebhookDto } from '../../../payos/dto/payos-webhook.dto';
import { PayosPaymentGatewayService } from '../../gateways/payos-payment-gateway.service';

/** Webhook PayOS: POST /api/payments/payos/webhook */
@Controller('payments/payos')
export class PayosWebhookController {
  constructor(
    private readonly payosPaymentGateway: PayosPaymentGatewayService,
  ) {}

  @Post('webhook')
  webhook(@Body() dto: PayosWebhookDto): Promise<{ received: true }> {
    return this.payosPaymentGateway.processPayosWebhook(dto);
  }
}
