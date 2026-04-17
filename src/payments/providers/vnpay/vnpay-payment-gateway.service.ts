import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VnpayService } from '../../../vnpay/vnpay.service';
import { CreatePaymentLinkDto } from '../../dto/create-payment-link.dto';
import {
  PaymentEntity,
  PaymentProvider,
  PaymentStatus,
} from '../../entities/payment.entity';
import { getPaymentPlanBySlug } from '../../payment-plans';
import type { IPaymentGateway } from '../payment-gateway.interface';
import {
  CreatePaymentLinkResponse,
  VnpayIpnResponseBody,
} from '../../types/payment.types';
import { computeCheckoutUrlExpireDate } from '../../utils/checkout-url-expire.util';
import { generatePaymentOrderCode } from '../../utils/payment-order-code.util';
import { PaymentInvitationDetailsService } from '../../services/payment-invitation-details.service';

@Injectable()
export class VnpayPaymentGatewayService implements IPaymentGateway {
  private readonly logger = new Logger(VnpayPaymentGatewayService.name);

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    private readonly configService: ConfigService,
    private readonly vnpayService: VnpayService,
    private readonly paymentInvitationDetailsService: PaymentInvitationDetailsService,
  ) {}

  async createPaymentLink(
    userId: number,
    dto: CreatePaymentLinkDto,
    clientIp: string,
  ): Promise<CreatePaymentLinkResponse> {
    await this.paymentInvitationDetailsService.assertSubdomainOptionalForCheckout(
      dto.invitation.subdomain,
    );
    const plan = getPaymentPlanBySlug(dto.invitation?.templateSlug);
    const providerOrderCode = String(generatePaymentOrderCode());
    const publicBase = this.getPublicApiBaseOrThrow();

    let checkoutUrl: string;
    try {
      checkoutUrl = this.vnpayService.buildPaymentUrl({
        orderId: providerOrderCode,
        amountVnd: plan.amountVnd,
        orderInfo: plan.orderLabel,
        returnUrl: `${publicBase}/api/payments/vnpay/return`,
        clientIp,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'VNPay configuration error';
      this.logger.warn(
        `createPaymentLink failed userId=${userId} order=${providerOrderCode}: ${msg}`,
      );
      throw new BadRequestException({
        message: msg,
        messageCode: 'MSG_VNPAY_CONFIG',
      });
    }

    const invitationDraft = dto.invitation
      ? this.paymentInvitationDetailsService.buildInvitationDraftFromDto(dto)
      : null;

    const payment = await this.paymentRepository.save(
      this.paymentRepository.create({
        userId,
        amount: plan.amountVnd,
        currency: 'VND',
        description: plan.orderLabel,
        planSlug: dto.invitation.templateSlug.trim().toLowerCase(),
        provider: PaymentProvider.VNPAY,
        providerOrderCode,
        checkoutUrl,
        checkoutUrlExpireDate: computeCheckoutUrlExpireDate(),
        invitationDraft,
      }),
    );

    return {
      paymentId: payment.id,
      checkoutUrl,
      orderCode: payment.providerOrderCode,
      status: payment.status,
    };
  }

  async processVnpayIpn(
    query: Record<string, string>,
  ): Promise<VnpayIpnResponseBody> {
    if (!this.hasValidVnpaySignature(query, 'ipn')) {
      return { RspCode: '97', Message: 'Checksum failed' };
    }

    const txnRef = query.vnp_TxnRef ?? '';
    if (!txnRef) {
      this.logger.warn('VNPay IPN RspCode=01 missing vnp_TxnRef');
      return { RspCode: '01', Message: 'Order not found' };
    }

    const payment = await this.paymentRepository.findOne({
      where: { providerOrderCode: txnRef },
    });
    if (!payment) {
      this.logger.warn(
        `VNPay IPN RspCode=01 payment not found vnp_TxnRef=${txnRef}`,
      );
      return { RspCode: '01', Message: 'Order not found' };
    }

    if (!this.isVnpayProvider(payment, txnRef, 'ipn')) {
      return { RspCode: '99', Message: 'Invalid provider' };
    }

    if (!this.isExpectedAmount(payment, query.vnp_Amount ?? '', txnRef, 'ipn')) {
      return { RspCode: '04', Message: 'Invalid amount' };
    }

    if (payment.status === PaymentStatus.PAID) {
      this.logger.warn(
        `VNPay IPN RspCode=02 duplicate confirm paymentId=${payment.id} vnp_TxnRef=${txnRef}`,
      );
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    const responseCode = query.vnp_ResponseCode ?? '';
    const transactionStatus = query.vnp_TransactionStatus ?? '';
    const isPaid = this.isPaidVnpayResult(responseCode, transactionStatus);

    if (isPaid) {
      await this.markPaidAndProvisionInvitation(payment, query);
      return { RspCode: '00', Message: 'Confirm Success' };
    }

    await this.applyFailureStatusIfNeeded(payment, responseCode, query);

    return { RspCode: '00', Message: 'Confirm Success' };
  }

  async processVnpayBrowserReturn(
    query: Record<string, string>,
  ): Promise<{ redirectUrl: string }> {
    const base = this.getFrontendBaseUrl();

    if (!this.hasValidVnpaySignature(query, 'return')) {
      return {
        redirectUrl: `${base}/payment/error?reason=checksum`,
      };
    }

    const txnRef = query.vnp_TxnRef ?? '';
    const payment = txnRef
      ? await this.paymentRepository.findOne({
          where: { providerOrderCode: txnRef },
        })
      : null;

    if (!payment) {
      this.logger.warn(
        `VNPay return redirect error=not_found vnp_TxnRef=${txnRef || '(empty)'}`,
      );
      return { redirectUrl: `${base}/payment/error?reason=not_found` };
    }

    if (!this.isExpectedAmount(payment, query.vnp_Amount ?? '', txnRef, 'return')) {
      return { redirectUrl: `${base}/payment/error?reason=amount` };
    }

    const responseCode = query.vnp_ResponseCode ?? '';
    const transactionStatus = query.vnp_TransactionStatus ?? '';
    const isPaid = this.isPaidVnpayResult(responseCode, transactionStatus);

    if (isPaid) {
      await this.markPaidAndProvisionInvitation(payment, query);
      return {
        redirectUrl: `${base}/payment/success?paymentId=${payment.id}`,
      };
    }

    if (responseCode === '24') {
      if (payment.status === PaymentStatus.PENDING) {
        payment.status = PaymentStatus.CANCELED;
        payment.rawWebhook = this.vnpayQueryToRecord(query);
        await this.paymentRepository.save(payment);
      }
      this.logger.warn(
        `VNPay return redirect cancel user_cancel paymentId=${payment.id} vnp_TxnRef=${txnRef}`,
      );
      return { redirectUrl: `${base}/payment/cancel` };
    }

    const nextStatus = this.mapVnpayFailureStatus(responseCode);
    if (
      nextStatus !== PaymentStatus.PENDING &&
      payment.status === PaymentStatus.PENDING
    ) {
      await this.savePaymentWithStatus(payment, nextStatus, query);
    }

    this.logger.warn(
      `VNPay return redirect error=failed paymentId=${payment.id} vnp_TxnRef=${txnRef} vnp_ResponseCode=${responseCode} vnp_TransactionStatus=${transactionStatus}`,
    );
    return { redirectUrl: `${base}/payment/error?reason=failed` };
  }

  private getPublicApiBaseOrThrow(): string {
    const raw = this.configService.get<string>('PUBLIC_API_BASE_URL', '');
    const trimmed = raw.trim().replace(/\/$/, '');
    if (!trimmed) {
      throw new BadRequestException({
        message:
          'Cần PUBLIC_API_BASE_URL (URL công khai của API, ví dụ https://api.example.com) khi dùng VNPay cho vnp_ReturnUrl và vnp_IpnUrl.',
        messageCode: 'MSG_PUBLIC_API_BASE_URL_REQUIRED',
      });
    }
    return trimmed;
  }

  private getFrontendBaseUrl(): string {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    return frontendUrl.replace(/\/$/, '');
  }

  private hasValidVnpaySignature(
    query: Record<string, string>,
    source: 'ipn' | 'return',
  ): boolean {
    if (this.vnpayService.verifySignature(query)) {
      return true;
    }
    const sh = query.vnp_SecureHash ?? '';
    if (source === 'ipn') {
      this.logger.warn(
        `VNPay IPN RspCode=97 checksum failed vnp_TxnRef=${query.vnp_TxnRef ?? ''} vnp_SecureHashType=${query.vnp_SecureHashType ?? '(none)'} secureHashLen=${sh.length}`,
      );
      return false;
    }
    this.logger.warn(
      `VNPay return redirect error=checksum vnp_TxnRef=${query.vnp_TxnRef ?? ''} vnp_SecureHashType=${query.vnp_SecureHashType ?? '(none)'} secureHashLen=${sh.length}`,
    );
    return false;
  }

  private isVnpayProvider(
    payment: PaymentEntity,
    txnRef: string,
    source: 'ipn' | 'return',
  ): boolean {
    if (payment.provider === PaymentProvider.VNPAY) {
      return true;
    }
    if (source === 'ipn') {
      this.logger.warn(
        `VNPay IPN RspCode=99 wrong provider paymentId=${payment.id} vnp_TxnRef=${txnRef}`,
      );
      return false;
    }
    this.logger.warn(
      `VNPay return redirect error=provider paymentId=${payment.id} vnp_TxnRef=${txnRef}`,
    );
    return false;
  }

  private isExpectedAmount(
    payment: PaymentEntity,
    vnpAmount: string,
    txnRef: string,
    source: 'ipn' | 'return',
  ): boolean {
    const expectedAmount = String(Math.round(payment.amount * 100));
    if (vnpAmount === expectedAmount) {
      return true;
    }
    if (source === 'ipn') {
      this.logger.warn(
        `VNPay IPN RspCode=04 amount mismatch paymentId=${payment.id} vnp_TxnRef=${txnRef} expected=${expectedAmount} got=${vnpAmount}`,
      );
      return false;
    }
    this.logger.warn(
      `VNPay return redirect error=amount paymentId=${payment.id} vnp_TxnRef=${txnRef} expected=${expectedAmount} got=${vnpAmount}`,
    );
    return false;
  }

  private isPaidVnpayResult(
    responseCode: string,
    transactionStatus: string,
  ): boolean {
    return responseCode === '00' && (!transactionStatus || transactionStatus === '00');
  }

  private async markPaidAndProvisionInvitation(
    payment: PaymentEntity,
    query: Record<string, string>,
  ): Promise<void> {
    if (payment.status !== PaymentStatus.PAID) {
      await this.savePaymentWithStatus(payment, PaymentStatus.PAID, query, true);
    }
    await this.paymentInvitationDetailsService.persistInvitationDetailsAfterPaidSafe(
      payment.id,
      'vnpay',
    );
  }

  private async applyFailureStatusIfNeeded(
    payment: PaymentEntity,
    responseCode: string,
    query: Record<string, string>,
  ): Promise<void> {
    const nextStatus = this.mapVnpayFailureStatus(responseCode);
    if (nextStatus !== PaymentStatus.PENDING) {
      await this.savePaymentWithStatus(payment, nextStatus, query);
    }
  }

  private async savePaymentWithStatus(
    payment: PaymentEntity,
    status: PaymentStatus,
    query: Record<string, string>,
    setPaidAt = false,
  ): Promise<void> {
    payment.status = status;
    payment.rawWebhook = this.vnpayQueryToRecord(query);
    if (setPaidAt) {
      payment.paidAt = new Date();
    }
    await this.paymentRepository.save(payment);
  }

  private vnpayQueryToRecord(
    query: Record<string, string>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { source: 'vnpay' };
    for (const [k, v] of Object.entries(query)) {
      out[k] = v;
    }
    return out;
  }

  private mapVnpayFailureStatus(responseCode: string): PaymentStatus {
    if (responseCode === '24') {
      return PaymentStatus.CANCELED;
    }
    if (responseCode === '00') {
      return PaymentStatus.PENDING;
    }
    if (responseCode === '') {
      return PaymentStatus.PENDING;
    }
    return PaymentStatus.FAILED;
  }
}
