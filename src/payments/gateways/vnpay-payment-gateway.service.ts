import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { VnpayService } from '../../vnpay/vnpay.service';
import { CreatePaymentLinkDto } from '../dto/create-payment-link.dto';
import {
  PaymentInvitationAlbumItem,
  PaymentInvitationDetailsEntity,
} from '../entities/payment-invitation-details.entity';
import {
  PaymentEntity,
  PaymentProvider,
  PaymentStatus,
} from '../entities/payment.entity';
import type { IPaymentGateway } from '../providers/payment-gateway.interface';
import {
  CreatePaymentLinkResponse,
  VnpayIpnResponseBody,
} from '../types/payment.types';
import { getPaymentPlanBySlug } from '../payment-plans';
import { generatePaymentOrderCode } from '../utils/payment-order-code.util';

@Injectable()
export class VnpayPaymentGatewayService implements IPaymentGateway {
  private readonly logger = new Logger(VnpayPaymentGatewayService.name);

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @InjectRepository(PaymentInvitationDetailsEntity)
    private readonly invitationDetailsRepository: Repository<PaymentInvitationDetailsEntity>,
    private readonly configService: ConfigService,
    private readonly vnpayService: VnpayService,
  ) {}

  async createPaymentLink(
    userId: number,
    dto: CreatePaymentLinkDto,
    clientIp: string,
  ): Promise<CreatePaymentLinkResponse> {
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
      ? this.buildInvitationDraftFromDto(dto)
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
    if (!this.vnpayService.verifySignature(query)) {
      const sh = query.vnp_SecureHash ?? '';
      this.logger.warn(
        `VNPay IPN RspCode=97 checksum failed vnp_TxnRef=${query.vnp_TxnRef ?? ''} vnp_SecureHashType=${query.vnp_SecureHashType ?? '(none)'} secureHashLen=${sh.length}`,
      );
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

    if (payment.provider !== PaymentProvider.VNPAY) {
      this.logger.warn(
        `VNPay IPN RspCode=99 wrong provider paymentId=${payment.id} vnp_TxnRef=${txnRef}`,
      );
      return { RspCode: '99', Message: 'Invalid provider' };
    }

    const expectedAmount = String(Math.round(payment.amount * 100));
    const vnpAmount = query.vnp_Amount ?? '';
    if (vnpAmount !== expectedAmount) {
      this.logger.warn(
        `VNPay IPN RspCode=04 amount mismatch paymentId=${payment.id} vnp_TxnRef=${txnRef} expected=${expectedAmount} got=${vnpAmount}`,
      );
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
    const isPaid =
      responseCode === '00' &&
      (!transactionStatus || transactionStatus === '00');

    if (isPaid) {
      payment.status = PaymentStatus.PAID;
      payment.paidAt = new Date();
      payment.rawWebhook = this.vnpayQueryToRecord(query);
      await this.paymentRepository.save(payment);
      await this.persistVnpayInvitationDetailsAfterPaidSafe(payment.id);
      return { RspCode: '00', Message: 'Confirm Success' };
    }

    const nextStatus = this.mapVnpayFailureStatus(responseCode);
    if (nextStatus !== PaymentStatus.PENDING) {
      payment.status = nextStatus;
      payment.rawWebhook = this.vnpayQueryToRecord(query);
      await this.paymentRepository.save(payment);
    }

    return { RspCode: '00', Message: 'Confirm Success' };
  }

  async processVnpayBrowserReturn(
    query: Record<string, string>,
  ): Promise<{ redirectUrl: string }> {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const base = frontendUrl.replace(/\/$/, '');

    if (!this.vnpayService.verifySignature(query)) {
      const sh = query.vnp_SecureHash ?? '';
      this.logger.warn(
        `VNPay return redirect error=checksum vnp_TxnRef=${query.vnp_TxnRef ?? ''} vnp_SecureHashType=${query.vnp_SecureHashType ?? '(none)'} secureHashLen=${sh.length}`,
      );
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

    const expectedAmount = String(Math.round(payment.amount * 100));
    if ((query.vnp_Amount ?? '') !== expectedAmount) {
      this.logger.warn(
        `VNPay return redirect error=amount paymentId=${payment.id} vnp_TxnRef=${txnRef} expected=${expectedAmount} got=${query.vnp_Amount ?? ''}`,
      );
      return { redirectUrl: `${base}/payment/error?reason=amount` };
    }

    const responseCode = query.vnp_ResponseCode ?? '';
    const transactionStatus = query.vnp_TransactionStatus ?? '';
    const isPaid =
      responseCode === '00' &&
      (!transactionStatus || transactionStatus === '00');

    if (isPaid) {
      if (payment.status !== PaymentStatus.PAID) {
        payment.status = PaymentStatus.PAID;
        payment.paidAt = new Date();
        payment.rawWebhook = this.vnpayQueryToRecord(query);
        await this.paymentRepository.save(payment);
      }
      await this.persistVnpayInvitationDetailsAfterPaidSafe(payment.id);
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
      payment.status = nextStatus;
      payment.rawWebhook = this.vnpayQueryToRecord(query);
      await this.paymentRepository.save(payment);
    }

    this.logger.warn(
      `VNPay return redirect error=failed paymentId=${payment.id} vnp_TxnRef=${txnRef} vnp_ResponseCode=${responseCode} vnp_TransactionStatus=${transactionStatus}`,
    );
    return { redirectUrl: `${base}/payment/error?reason=failed` };
  }

  private buildInvitationDraftFromDto(
    dto: CreatePaymentLinkDto,
  ): Record<string, unknown> {
    const inv = dto.invitation!;
    return {
      templateSlug: inv.templateSlug ?? null,
      version: inv.version ?? 1,
      brideName: inv.brideName,
      groomName: inv.groomName,
      weddingDate: inv.weddingDate ?? null,
      venue: inv.venue ?? null,
      album: inv.album?.length
        ? inv.album.map((a) => ({
            storageKey: a.storageKey,
            caption: a.caption ?? null,
            sortOrder: a.sortOrder ?? null,
          }))
        : null,
    };
  }

  private async persistVnpayInvitationDetailsAfterPaidSafe(
    paymentId: number,
  ): Promise<void> {
    try {
      await this.persistVnpayInvitationDetailsAfterPaid(paymentId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `VNPay lưu thiệp cưới thất bại paymentId=${paymentId}: ${msg}`,
        e instanceof Error ? e.stack : undefined,
      );
    }
  }

  private async persistVnpayInvitationDetailsAfterPaid(
    paymentId: number,
  ): Promise<void> {
    const existing = await this.invitationDetailsRepository.findOne({
      where: { payment: { id: paymentId } },
    });
    if (existing) {
      return;
    }

    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
    });
    if (!payment?.invitationDraft || typeof payment.invitationDraft !== 'object') {
      return;
    }

    const d = payment.invitationDraft as Record<string, unknown>;
    const brideName = typeof d.brideName === 'string' ? d.brideName : '';
    const groomName = typeof d.groomName === 'string' ? d.groomName : '';
    if (!brideName.trim() || !groomName.trim()) {
      this.logger.warn(
        `VNPay invitation draft thiếu tên cô dâu/chú rể paymentId=${paymentId}`,
      );
      return;
    }

    const code = randomBytes(16).toString('hex');

    let weddingDate: Date | null = null;
    if (typeof d.weddingDate === 'string' && d.weddingDate.trim()) {
      const parsed = new Date(d.weddingDate);
      weddingDate = Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const version =
      typeof d.version === 'number' &&
      Number.isFinite(d.version) &&
      d.version >= 1
        ? Math.floor(d.version)
        : 1;

    let album: PaymentInvitationAlbumItem[] | null = null;
    if (Array.isArray(d.album)) {
      const items = d.album
        .map((item): PaymentInvitationAlbumItem | null => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const o = item as Record<string, unknown>;
          const storageKey =
            typeof o.storageKey === 'string' ? o.storageKey : '';
          if (!storageKey) {
            return null;
          }
          return {
            storageKey: storageKey.slice(0, 500),
            caption:
              typeof o.caption === 'string' ? o.caption.slice(0, 500) : null,
            ...(typeof o.sortOrder === 'number' && Number.isFinite(o.sortOrder)
              ? { sortOrder: Math.max(0, Math.floor(o.sortOrder)) }
              : {}),
          };
        })
        .filter((x): x is PaymentInvitationAlbumItem => x !== null);
      album = items.length > 0 ? items : null;
    }

    const details = this.invitationDetailsRepository.create({
      payment,
      code,
      templateSlug:
        typeof d.templateSlug === 'string'
          ? d.templateSlug.slice(0, 120)
          : null,
      version,
      brideName: brideName.slice(0, 255),
      groomName: groomName.slice(0, 255),
      weddingDate,
      venue: typeof d.venue === 'string' ? d.venue.slice(0, 500) : null,
      album,
    });

    try {
      await this.invitationDetailsRepository.save(details);
    } catch (e) {
      if (this.isPgUniqueViolation(e)) {
        return;
      }
      throw e;
    }

    payment.invitationDraft = null;
    await this.paymentRepository.save(payment);
  }

  private isPgUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    );
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
