import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayosService } from '../payos/payos.service';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import { PayosWebhookDto } from './dto/payos-webhook.dto';
import { PaymentEntity, PaymentStatus } from './entities/payment.entity';
import {
  CreatePaymentLinkResponse,
  PaymentDetailResponse,
  PaymentListResponse,
} from './types/payment.types';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    private readonly configService: ConfigService,
    private readonly payosService: PayosService,
  ) {}

  async createPaymentLink(
    userId: number,
    dto: CreatePaymentLinkDto,
  ): Promise<CreatePaymentLinkResponse> {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const orderCode = this.generateOrderCode();

    const payosData = await this.payosService.createPaymentLink({
      orderCode,
      amount: dto.amount,
      description: dto.description,
      returnUrl: `${frontendUrl}/payment/success`,
      cancelUrl: `${frontendUrl}/payment/cancel`,
    });

    const payment = await this.paymentRepository.save(
      this.paymentRepository.create({
        userId,
        amount: dto.amount,
        currency: 'VND',
        description: dto.description.trim(),
        providerOrderCode: String(orderCode),
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

  async processWebhook(dto: PayosWebhookDto): Promise<{ received: true }> {
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
    payment.rawWebhook = verifiedData;
    if (nextStatus === PaymentStatus.PAID) {
      payment.paidAt = new Date();
    }
    await this.paymentRepository.save(payment);

    return { received: true };
  }

  async getPaymentById(
    id: number,
    userId: number,
  ): Promise<PaymentDetailResponse> {
    const payment = await this.paymentRepository.findOne({ where: { id } });
    if (!payment) {
      throw new NotFoundException({
        message: 'Không tìm thấy payment',
        messageCode: 'MSG_PAYMENT_NOT_FOUND',
      });
    }
    if (payment.userId !== userId) {
      throw new ForbiddenException({
        message: 'Bạn không có quyền truy cập payment này',
        messageCode: 'MSG_PAYMENT_FORBIDDEN',
      });
    }

    return {
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      description: payment.description ?? null,
      status: payment.status,
      provider: payment.provider,
      orderCode: payment.providerOrderCode,
      checkoutUrl: payment.checkoutUrl ?? null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      paidAt: payment.paidAt?.toISOString() ?? null,
    };
  }

  async listPaymentsByUser(
    userId: number,
    limit = 20,
  ): Promise<PaymentListResponse> {
    const normalizedLimit = Math.min(Math.max(limit, 1), 100);
    const [payments, total] = await this.paymentRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: normalizedLimit,
    });

    return {
      items: payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        description: payment.description ?? null,
        status: payment.status,
        provider: payment.provider,
        orderCode: payment.providerOrderCode,
        checkoutUrl: payment.checkoutUrl ?? null,
        createdAt: payment.createdAt.toISOString(),
        updatedAt: payment.updatedAt.toISOString(),
        paidAt: payment.paidAt?.toISOString() ?? null,
      })),
      total,
    };
  }

  private generateOrderCode(): number {
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 1000);
    return Number(`${timestamp}${randomSuffix}`.slice(-15));
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
