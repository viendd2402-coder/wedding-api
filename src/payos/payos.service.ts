import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayOS } from '@payos/node';
import {
  CreatePayosPaymentLinkInput,
  PayosWebhookPayload,
} from './types/payos.types';

@Injectable()
export class PayosService {
  private readonly payosClient: PayOS;

  constructor(private readonly configService: ConfigService) {
    this.payosClient = new PayOS({
      clientId: this.configService.get<string>('PAYOS_CLIENT_ID', ''),
      apiKey: this.configService.get<string>('PAYOS_API_KEY', ''),
      checksumKey: this.configService.get<string>('PAYOS_CHECKSUM_KEY', ''),
    });
  }

  createPaymentLink(input: CreatePayosPaymentLinkInput): Promise<{
    checkoutUrl: string;
    qrCode?: string;
  }> {
    return this.payosClient.paymentRequests.create({
      orderCode: input.orderCode,
      amount: input.amount,
      description: input.description,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    });
  }

  verifyWebhook(
    payload: PayosWebhookPayload,
  ): Promise<Record<string, unknown>> {
    type VerifyWebhookInput = Parameters<PayOS['webhooks']['verify']>[0];

    return this.payosClient.webhooks.verify({
      code: payload.code ?? '00',
      desc: payload.desc ?? '',
      success: payload.success ?? true,
      data: payload.data as VerifyWebhookInput['data'],
      signature: payload.signature ?? '',
    });
  }
}
