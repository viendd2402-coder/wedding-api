export type CreatePayosPaymentLinkInput = {
  orderCode: number;
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
};

export type PayosWebhookPayload = {
  code?: string;
  desc?: string;
  success?: boolean;
  data?: {
    orderCode?: number;
    amount?: number;
    status?: string;
    [key: string]: unknown;
  };
  signature?: string;
};
