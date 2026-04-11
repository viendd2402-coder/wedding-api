import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

export type VnpayBuildPaymentUrlInput = {
  orderId: string;
  amountVnd: number;
  orderInfo: string;
  returnUrl: string;
  clientIp: string;
};

@Injectable()
export class VnpayService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Lấy query VNPay từ URL thô (giống trình duyệt / PHP $_GET), tránh lệch checksum
   * so với `req.query` khi có ký tự đặc biệt, `+`/%, hoặc parser qs khác bản chuẩn.
   */
  static parseVnpQueryFromRequest(req: Request): Record<string, string> {
    const search = VnpayService.extractRawSearchString(req);
    return VnpayService.parseVnpQueryString(search);
  }

  private static extractRawSearchString(req: Request): string {
    const candidates = [req.originalUrl ?? '', req.url ?? ''];
    for (const raw of candidates) {
      const q = raw.indexOf('?');
      if (q < 0) {
        continue;
      }
      const rest = raw.slice(q + 1);
      const h = rest.indexOf('#');
      return h >= 0 ? rest.slice(0, h) : rest;
    }
    return '';
  }

  private static parseVnpQueryString(search: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (!search) {
      return out;
    }
    const sp = new URLSearchParams(search);
    const seen = new Set<string>();
    for (const [k, v] of sp.entries()) {
      if (!k.startsWith('vnp_')) {
        continue;
      }
      if (seen.has(k)) {
        continue;
      }
      seen.add(k);
      out[k] = v;
    }
    return out;
  }

  buildPaymentUrl(input: VnpayBuildPaymentUrlInput): string {
    console.log('buildPaymentUrl input:', JSON.stringify(input));

    const tmnCode = this.trimVnpEnv(
      this.configService.get<string>('VNPAY_TMN_CODE', ''),
    );
    const secret = this.trimVnpEnv(
      this.configService.get<string>('VNPAY_HASH_SECRET', ''),
    );
    if (!tmnCode || !secret) {
      throw new Error('VNPay: thiếu VNPAY_TMN_CODE hoặc VNPAY_HASH_SECRET');
    }

    const baseUrl = this.configService.get<string>(
      'VNPAY_PAYMENT_URL',
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    );

    const createDate = this.formatDate(new Date());
    const amount = String(Math.round(input.amountVnd * 100));

    // IPN khai báo trên cổng VNPay; không gửi vnp_IpnUrl trong query (lệch checksum với cổng).
    const vnpParams: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: input.orderId,
      vnp_OrderInfo: this.truncateOrderInfo(input.orderInfo),
      vnp_OrderType: 'other',
      vnp_Amount: amount,
      vnp_ReturnUrl: input.returnUrl,
      vnp_CreateDate: createDate,
      vnp_IpAddr: this.sanitizeIp(input.clientIp),
    };

    const secureHash = this.hmacHex(secret, this.buildSignData(vnpParams), 'sha512');
    vnpParams.vnp_SecureHash = secureHash;

    const sortedKeys = Object.keys(vnpParams).sort();

    // ✅ key dùng encodeURIComponent (key không có ký tự đặc biệt nên không ảnh hưởng)
    // ✅ value dùng vnpayEncodeValue — nhất quán với buildSignData
    const qs = sortedKeys
    .map((k) => `${k}=${this.vnpayEncodeValue(vnpParams[k] ?? '')}`)
    .join('&');


    // DEBUG
  console.log('=== buildPaymentUrl DEBUG ===');
  console.log('signData:', this.buildSignData(vnpParams));
  console.log('qs:', (() => {
    const sortedKeys = Object.keys(vnpParams).sort();
    return sortedKeys
      .map((k) => `${k}=${this.vnpayEncodeValue(vnpParams[k] ?? '')}`)
      .join('&');
  })());
  // END DEBUG

    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}${qs}`;
  }

  verifySignature(params: Record<string, string>): boolean {
    const secureHash = (params.vnp_SecureHash ?? '').toLowerCase();
    if (!secureHash) {
      return false;
    }

     // DEBUG
  console.log('=== verifySignature DEBUG ===');
  console.log('vnp_OrderInfo từ VNPay:', params.vnp_OrderInfo);
  console.log('signData:', this.buildSignData(params));
  console.log('secureHash từ VNPay:', secureHash);
  const a = this.hmacHex(
    this.trimVnpEnv(this.configService.get<string>('VNPAY_HASH_SECRET', '')),
    this.buildSignData(params),
    'sha512'
  ).toLowerCase();
  console.log('signed tính được:', a);
  console.log('match:', a === secureHash);
  // END DEBUG

    const secret = this.trimVnpEnv(
      this.configService.get<string>('VNPAY_HASH_SECRET', ''),
    );
    if (!secret) {
      return false;
    }

    const signData = this.buildSignData(params);
    // DEBUG - xóa sau khi fix
  console.log('=== VNPay Debug ===');
  console.log('signData:', signData);
  console.log('secureHash từ VNPay:', secureHash);
  console.log('secret length:', secret.length);
  console.log('secret (repr):', JSON.stringify(secret)); // phát hiện BOM, space thừa
  const signed = this.hmacHex(secret, signData, 'sha512').toLowerCase();
  console.log('signed (tính được):', signed);
  console.log('match:', signed === secureHash);
  // END DEBUG

  console.log('secureHash length:', secureHash.length);
console.log('signed length:', signed.length);
console.log('raw vnp_SecureHash:', params.vnp_SecureHash);

    for (const algo of this.resolveVerifyHmacAlgorithms(
      params.vnp_SecureHashType,
      secureHash.length,
    )) {
      const signed = this.hmacHex(secret, signData, algo).toLowerCase();
      try {
        if (timingSafeEqual(Buffer.from(signed), Buffer.from(secureHash))) {
          return true;
        }
      } catch {
        /* độ dài hex khác nhau giữa sha256/sha512 */
      }
    }
    return false;
  }

  /** TMN / HashSecret trong .env thường thừa khoảng trắng hoặc BOM → HMAC lệch. */
  private trimVnpEnv(raw: string): string {
    return raw.replace(/^\uFEFF/, '').trim();
  }

  /**
   * Cổng có thể gửi vnp_SecureHashType=SHA256 (HMAC-SHA256) hoặc SHA512; mặc định SHA512.
   * Nếu thiếu type, suy từ độ dài chuỗi hex (64 = sha256, 128 = sha512).
   */
  private resolveVerifyHmacAlgorithms(
    secureHashType: string | undefined,
    secureHashHexLength: number,
  ): Array<'sha256' | 'sha512'> {
    const t = (secureHashType ?? '').toUpperCase();
    const fromType: Array<'sha256' | 'sha512'> = [];
    if (t.includes('256') && !t.includes('512')) {
      fromType.push('sha256');
    } else if (t.includes('512') || t.includes('HMAC')) {
      fromType.push('sha512');
    }
    const fromLen: Array<'sha256' | 'sha512'> =
      secureHashHexLength === 64
        ? ['sha256']
        : secureHashHexLength === 128
          ? ['sha512']
          : [];
    const out: Array<'sha256' | 'sha512'> = [];
    const push = (a: 'sha256' | 'sha512') => {
      if (!out.includes(a)) {
        out.push(a);
      }
    };
    const tail = ['sha512', 'sha256'] as const;
    for (const a of [...fromType, ...fromLen, ...tail]) {
      push(a);
    }
    return out;
  }

  private hmacHex(
    secret: string,
    signData: string,
    algorithm: 'sha256' | 'sha512',
  ): string {
    return createHmac(algorithm, secret)
      .update(Buffer.from(signData, 'utf8'))
      .digest('hex');
  }

  private buildSignData(params: Record<string, string>): string {
    // Bỏ vnp_SecureHash và vnp_SecureHashType (cổng không đưa hai field này vào chuỗi ký).
    // Chỉ vnp_*; dùng encodeURIComponent + khoảng trắng → + (KHÔNG dùng URLSearchParams.toString()
    // cho chuỗi ký — nó mã hóa ( ) ! ' * khác encodeURIComponent, sandbox sẽ báo sai chữ ký).
    const sortedKeys = Object.keys(params)
      .filter(
        (k) =>
          k.startsWith('vnp_') &&
          k !== 'vnp_SecureHash' &&
          k !== 'vnp_SecureHashType' &&
          params[k] != null,
      )
      .sort();

    return sortedKeys
      .map((k) => `${k}=${this.vnpayEncodeValue(params[k] as string)}`)
      .join('&');
  }

  /** Giá trị trong chuỗi checksum: như URLEncode JS (khoảng trắng → +). */
  private vnpayEncodeValue(value: string): string {
    return encodeURIComponent(value)
    .replace(/%20/g, '+')   // space → +
    .replace(/%28/g, '(')   // %28 → (
    .replace(/%29/g, ')');  // %29 → )
  }

  private formatDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
      `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    );
  }

  private truncateOrderInfo(text: string): string {
    const t = text.trim();
    return t.length > 255 ? t.slice(0, 255) : t;
  }

  private sanitizeIp(ip: string): string {
    const v = ip.trim();
    if (!v || v === '::1') {
      return '127.0.0.1';
    }
    if (v.startsWith('::ffff:')) {
      return v.slice(7);
    }
    return v.length > 45 ? '127.0.0.1' : v;
  }
}
