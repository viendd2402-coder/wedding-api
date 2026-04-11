import { SetMetadata } from '@nestjs/common';

export const BYPASS_RESPONSE_ENVELOPE_KEY = 'bypassResponseEnvelope';

/** Dùng cho callback bên thứ ba (VNPay IPN, redirect) cần body HTTP thuần, không bọc { success, data }. */
export const BypassResponseEnvelope = () =>
  SetMetadata(BYPASS_RESPONSE_ENVELOPE_KEY, true);
