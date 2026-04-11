import { BadRequestException } from '@nestjs/common';

export type PaymentPlanDefinition = {
  amountVnd: number;
  /** Lưu DB + gửi cổng thanh toán (VNPay orderInfo nên ngắn, ASCII). */
  orderLabel: string;
};

const PLANS: Record<string, PaymentPlanDefinition> = {
  'brightly-basic': {
    amountVnd: 149000,
    orderLabel: 'Brightly Basic Template',
  },
  'slide-flex': {
    amountVnd: 149000,
    orderLabel: 'Slide Flex Template',
  },
};

export function getPaymentPlanBySlug(slug: string): PaymentPlanDefinition {
  const key = slug.trim().toLowerCase();
  const plan = PLANS[key];
  if (!plan) {
    throw new BadRequestException({
      message: `Không có gói thanh toán cho slug: ${slug}`,
      messageCode: 'MSG_PAYMENT_PLAN_NOT_FOUND',
    });
  }
  return plan;
}
