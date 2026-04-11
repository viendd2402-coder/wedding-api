/** Thời lượng link cổng thanh toán (VNPay mẫu tích hợp + sandbox thường ~15 phút). */
export const CHECKOUT_URL_EXPIRE_MINUTES = 15;

export function computeCheckoutUrlExpireDate(): Date {
  return new Date(Date.now() + CHECKOUT_URL_EXPIRE_MINUTES * 60 * 1000);
}
