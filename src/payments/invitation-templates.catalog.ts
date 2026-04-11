/**
 * Danh sách template thiệp: slug, tên hiển thị, miễn phí / trả phí, và (nếu trả phí) gói thanh toán.
 * Thêm template: chỉ sửa mảng này — `payment-plans` đọc `paymentPlan` từ đây.
 */
export type InvitationTemplatePaymentPlan = {
  amountVnd: number;
  /** Lưu DB + gửi cổng thanh toán (VNPay orderInfo nên ngắn, ASCII). */
  orderLabel: string;
};

export type InvitationTemplateDefinition = {
  templateSlug: string;
  templateName: string;
  isFree: boolean;
  /** Bắt buộc khi `isFree === false`. */
  paymentPlan?: InvitationTemplatePaymentPlan;
};

export const INVITATION_TEMPLATES: readonly InvitationTemplateDefinition[] = [
  {
    templateSlug: 'brightly-basic',
    templateName: 'BRIGHTLY BASIC',
    isFree: false,
    paymentPlan: {
      amountVnd: 149000,
      orderLabel: 'Brightly Basic Template',
    },
  },
  {
    templateSlug: 'slide-flex',
    templateName: 'SLIDEFLEX',
    isFree: false,
    paymentPlan: {
      amountVnd: 149000,
      orderLabel: 'Slide Flex Template',
    },
  },
  {
    templateSlug: 'minimal-muse',
    templateName: 'MINIMAL MUSE',
    isFree: true,
  },
] as const;

/** Slug hợp lệ (cho DTO / validate). */
export const INVITATION_TEMPLATE_SLUGS: readonly string[] =
  INVITATION_TEMPLATES.map((t) => t.templateSlug);

/** Slug template miễn phí (lowercase) — dùng sort khi hòa `usageCount` (trả phí lên trước). */
export const FREE_INVITATION_TEMPLATE_SLUGS_LOWER: readonly string[] =
  INVITATION_TEMPLATES.filter((t) => t.isFree).map((t) =>
    t.templateSlug.toLowerCase(),
  );

const bySlugLower = new Map<string, InvitationTemplateDefinition>(
  INVITATION_TEMPLATES.map((t) => [t.templateSlug.toLowerCase(), t]),
);

export function getInvitationTemplateBySlug(
  slug: string | null | undefined,
): InvitationTemplateDefinition | undefined {
  if (!slug?.trim()) {
    return undefined;
  }
  return bySlugLower.get(slug.trim().toLowerCase());
}

/** Tên hiển thị: lấy từ catalog; slug lạ trong DB vẫn fallback chữ IN HOA từ slug. */
export function invitationTemplateDisplayName(
  slug: string | null | undefined,
): string {
  const def = getInvitationTemplateBySlug(slug);
  if (def) {
    return def.templateName;
  }
  if (!slug?.trim()) {
    return '';
  }
  return slug
    .trim()
    .toLowerCase()
    .split(/[-_]/)
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
}
