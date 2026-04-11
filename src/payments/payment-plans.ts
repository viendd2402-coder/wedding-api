import { BadRequestException } from '@nestjs/common';
import { INVITATION_TEMPLATES } from './invitation-templates.catalog';

export type PaymentPlanDefinition = {
  amountVnd: number;
  orderLabel: string;
};

function buildPaidPlansFromCatalog(): Record<string, PaymentPlanDefinition> {
  const out: Record<string, PaymentPlanDefinition> = {};
  for (const t of INVITATION_TEMPLATES) {
    if (t.isFree) {
      continue;
    }
    if (!t.paymentPlan) {
      throw new Error(
        `Template trả phí "${t.templateSlug}" thiếu paymentPlan trong invitation-templates.catalog`,
      );
    }
    out[t.templateSlug.toLowerCase()] = t.paymentPlan;
  }
  return out;
}

const PLANS: Record<string, PaymentPlanDefinition> = buildPaidPlansFromCatalog();

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
