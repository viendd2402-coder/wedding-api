import {
  ForbiddenException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { S3Service } from '../storage/s3.service';
import { PaymentEntity } from './entities/payment.entity';
import { ACTIVE_PAYMENT_GATEWAY } from './providers/payment-gateway.tokens';
import type { IPaymentGateway } from './providers/payment-gateway.interface';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import {
  CreatePaymentLinkResponse,
  PaymentDetailResponse,
  PaymentListResponse,
} from './types/payment.types';
import { mapPaymentToUserListItem } from './utils/user-payment-list.mapper';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @Inject(ACTIVE_PAYMENT_GATEWAY)
    private readonly activePaymentGateway: IPaymentGateway,
    private readonly s3Service: S3Service,
  ) {}

  createPaymentLink(
    userId: number,
    dto: CreatePaymentLinkDto,
    clientIp: string,
  ): Promise<CreatePaymentLinkResponse> {
    return this.activePaymentGateway.createPaymentLink(userId, dto, clientIp);
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
      planSlug: payment.planSlug ?? null,
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
      relations: { invitationDetails: true },
    });

    return {
      items: payments.map((payment) =>
        mapPaymentToUserListItem(payment, (key) =>
          this.s3Service.resolvePublicObjectUrl(key),
        ),
      ),
      total,
    };
  }
}
