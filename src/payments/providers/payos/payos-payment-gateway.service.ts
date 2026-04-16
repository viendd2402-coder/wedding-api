import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayosWebhookDto } from '../../../payos/dto/payos-webhook.dto';
import { PayosService } from '../../../payos/payos.service';
import { CreatePaymentLinkDto } from '../../dto/create-payment-link.dto';
import {
  PaymentEntity,
  PaymentProvider,
  PaymentStatus,
} from '../../entities/payment.entity';
import { getPaymentPlanBySlug } from '../../payment-plans';
import type { IPaymentGateway } from '../payment-gateway.interface';
import { CreatePaymentLinkResponse } from '../../types/payment.types';
import { PaymentInvitationDetailsService } from '../../services/payment-invitation-details.service';
import { computeCheckoutUrlExpireDate } from '../../utils/checkout-url-expire.util';
import { generatePaymentOrderCode } from '../../utils/payment-order-code.util';

@Injectable()
export class PayosPaymentGatewayService implements IPaymentGateway {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    private readonly configService: ConfigService,
    private readonly payosService: PayosService,
    private readonly paymentInvitationDetailsService: PaymentInvitationDetailsService,
  ) {}

  async createPaymentLink(
    userId: number,
    dto: CreatePaymentLinkDto,
    _clientIp: string,
  ): Promise<CreatePaymentLinkResponse> {
    const plan = getPaymentPlanBySlug(dto.invitation.templateSlug);
    const frontendBase = this.getFrontendBaseUrl();
    const orderCode = this.generatePayosOrderCode();
    const providerOrderCode = String(orderCode);

    const payosData = await this.payosService.createPaymentLink({
      orderCode,
      amount: plan.amountVnd,
      description: plan.orderLabel,
      returnUrl: `${frontendBase}/payment/success`,
      cancelUrl: `${frontendBase}/payment/cancel`,
    });

    const payment = await this.createPendingPayosPayment(
      userId,
      dto,
      providerOrderCode,
      plan.amountVnd,
      plan.orderLabel,
      payosData.checkoutUrl,
    );

    return {
      paymentId: payment.id,
      checkoutUrl: payosData.checkoutUrl,
      orderCode: payment.providerOrderCode,
      status: payment.status,
    };
  }

  async processPayosWebhook(dto: PayosWebhookDto): Promise<{ received: true }> {
    const verifiedData = await this.payosService.verifyWebhook(dto);
    const orderCode = this.extractOrderCode(verifiedData.orderCode);
    if (!orderCode) {
      throw new BadRequestException({
        message: 'Webhook thiếu orderCode',
        messageCode: 'MSG_PAYOS_WEBHOOK_INVALID',
      });
    }

    const payment = await this.paymentRepository.findOne({
      where: { providerOrderCode: orderCode },
    });

    if (!payment) {
      throw new NotFoundException({
        message: 'Không tìm thấy payment theo orderCode',
        messageCode: 'MSG_PAYMENT_NOT_FOUND',
      });
    }

    if (payment.status === PaymentStatus.PAID) {
      return { received: true };
    }

    const nextStatus = this.mapPayosStatus(
      this.normalizePayosStatus(verifiedData.status),
    );
    await this.savePayosWebhookResult(
      payment,
      nextStatus,
      verifiedData as Record<string, unknown>,
    );
    await this.provisionInvitationWhenPaid(payment.id, nextStatus);

    return { received: true };
  }

  private getFrontendBaseUrl(): string {
    return this.configService
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
  }

  private generatePayosOrderCode(): number {
    return generatePaymentOrderCode();
  }

  private async createPendingPayosPayment(
    userId: number,
    dto: CreatePaymentLinkDto,
    providerOrderCode: string,
    amountVnd: number,
    orderLabel: string,
    checkoutUrl: string,
  ): Promise<PaymentEntity> {
    return this.paymentRepository.save(
      this.paymentRepository.create({
        userId,
        amount: amountVnd,
        currency: 'VND',
        description: orderLabel,
        planSlug: dto.invitation.templateSlug.trim().toLowerCase(),
        provider: PaymentProvider.PAYOS,
        providerOrderCode,
        checkoutUrl,
        checkoutUrlExpireDate: computeCheckoutUrlExpireDate(),
        invitationDraft:
          this.paymentInvitationDetailsService.buildInvitationDraftFromDto(dto),
      }),
    );
  }

  private extractOrderCode(orderCodeRaw: unknown): string {
    if (typeof orderCodeRaw === 'number' || typeof orderCodeRaw === 'string') {
      return String(orderCodeRaw);
    }
    return '';
  }

  private normalizePayosStatus(statusRaw: unknown): string {
    return typeof statusRaw === 'string' ? statusRaw.toUpperCase() : '';
  }

  private async savePayosWebhookResult(
    payment: PaymentEntity,
    nextStatus: PaymentStatus,
    rawWebhook: Record<string, unknown>,
  ): Promise<void> {
    payment.status = nextStatus;
    payment.rawWebhook = rawWebhook;
    if (nextStatus === PaymentStatus.PAID) {
      payment.paidAt = new Date();
    }
    await this.paymentRepository.save(payment);
  }

  private async provisionInvitationWhenPaid(
    paymentId: number,
    nextStatus: PaymentStatus,
  ): Promise<void> {
    if (nextStatus === PaymentStatus.PAID) {
      await this.paymentInvitationDetailsService.persistInvitationDetailsAfterPaidSafe(
        paymentId,
        'payos',
      );
    }
  }

  private mapPayosStatus(status: string): PaymentStatus {
    switch (status) {
      case 'PAID':
      case 'SUCCESS':
        return PaymentStatus.PAID;
      case 'CANCELLED':
      case 'CANCELED':
        return PaymentStatus.CANCELED;
      case 'EXPIRED':
        return PaymentStatus.EXPIRED;
      case 'FAILED':
        return PaymentStatus.FAILED;
      default:
        return PaymentStatus.PENDING;
    }
  }
}
