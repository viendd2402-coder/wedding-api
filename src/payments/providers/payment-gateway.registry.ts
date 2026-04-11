import type { ActivePaymentProvider } from '../payment-provider';
import type { IPaymentGateway } from './payment-gateway.interface';

export type PaymentGatewayRegistry = Record<
  ActivePaymentProvider,
  IPaymentGateway
>;

export function getPaymentGatewayFromRegistry(
  providerId: ActivePaymentProvider,
  registry: PaymentGatewayRegistry,
): IPaymentGateway {
  return registry[providerId];
}
