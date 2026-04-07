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
