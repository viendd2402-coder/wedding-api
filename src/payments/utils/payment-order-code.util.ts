export function generatePaymentOrderCode(): number {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  return Number(`${timestamp}${randomSuffix}`.slice(-15));
}
