import { CreatePaymentLinkDto } from '../dto/create-payment-link.dto';
import { CreatePaymentLinkResponse } from '../types/payment.types';

/** Cổng thanh toán đang bật theo `PAYMENT_PROVIDER` — chỉ tạo link checkout. */
export interface IPaymentGateway {
  createPaymentLink(
    userId: number,
    dto: CreatePaymentLinkDto,
    clientIp: string,
  ): Promise<CreatePaymentLinkResponse>;
}
