import { ConfigService } from '@nestjs/config';

export type ActivePaymentProvider = 'payos' | 'vnpay';

export function getActivePaymentProvider(
  configService: ConfigService,
): ActivePaymentProvider {
  const raw = configService.get<string>('PAYMENT_PROVIDER', 'payos');
  const normalized = raw.trim().toLowerCase();
  return normalized === 'vnpay' ? 'vnpay' : 'payos';
}
