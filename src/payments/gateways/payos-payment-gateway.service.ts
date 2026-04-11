import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayosWebhookDto } from '../../payos/dto/payos-webhook.dto';
import { PayosService } from '../../payos/payos.service';
import { CreatePaymentLinkDto } from '../dto/create-payment-link.dto';
import { getPaymentPlanBySlug } from '../payment-plans';
import {
  PaymentEntity,
  PaymentProvider,
  PaymentStatus,
} from '../entities/payment.entity';
import type { IPaymentGateway } from '../providers/payment-gateway.interface';
import { CreatePaymentLinkResponse } from '../types/payment.types';
import { generatePaymentOrderCode } from '../utils/payment-order-code.util';

@Injectable()
export class PayosPaymentGatewayService implements IPaymentGateway {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    private readonly configService: ConfigService,
    private readonly payosService: PayosService,
  ) {}

  async createPaymentLink(
    userId: number,
    dto: CreatePaymentLinkDto,
    _clientIp: string,
  ): Promise<CreatePaymentLinkResponse> {
    const plan = getPaymentPlanBySlug(dto.invitation.templateSlug);
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const orderCode = generatePaymentOrderCode();
    const providerOrderCode = String(orderCode);

    const payosData = await this.payosService.createPaymentLink({
      orderCode,
      amount: plan.amountVnd,
      description: plan.orderLabel,
      returnUrl: `${frontendUrl}/payment/success`,
      cancelUrl: `${frontendUrl}/payment/cancel`,
    });

    const payment = await this.paymentRepository.save(
      this.paymentRepository.create({
        userId,
        amount: plan.amountVnd,
        currency: 'VND',
        description: plan.orderLabel,
        planSlug: dto.invitation.templateSlug.trim().toLowerCase(),
        provider: PaymentProvider.PAYOS,
        providerOrderCode,
        checkoutUrl: payosData.checkoutUrl,
      }),
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
    const orderCodeRaw = verifiedData.orderCode;
    const orderCode =
      typeof orderCodeRaw === 'number' || typeof orderCodeRaw === 'string'
        ? String(orderCodeRaw)
        : '';
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

    const statusRaw = verifiedData.status;
    const nextStatus = this.mapPayosStatus(
      typeof statusRaw === 'string' ? statusRaw.toUpperCase() : '',
    );
    payment.status = nextStatus;
    payment.rawWebhook = verifiedData as Record<string, unknown>;
    if (nextStatus === PaymentStatus.PAID) {
      payment.paidAt = new Date();
    }
    await this.paymentRepository.save(payment);

    return { received: true };
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
