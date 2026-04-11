import { PaymentStatus } from '../entities/payment.entity';

export type CreatePaymentLinkResponse = {
  paymentId: number;
  checkoutUrl: string;
  orderCode: string;
  status: PaymentStatus;
};

export type PaymentDetailResponse = {
  id: number;
  amount: number;
  currency: string;
  planSlug: string | null;
  description: string | null;
  status: PaymentStatus;
  provider: string;
  orderCode: string;
  checkoutUrl: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
};

export type PaymentListResponse = {
  items: PaymentDetailResponse[];
  total: number;
};

export type VnpayIpnResponseBody = {
  RspCode: string;
  Message: string;
};
