import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { S3Service } from '../storage/s3.service';
import { PaymentInvitationDetailsEntity } from './entities/payment-invitation-details.entity';
import { PaymentEntity } from './entities/payment.entity';
import { ACTIVE_PAYMENT_GATEWAY } from './providers/payment-gateway.tokens';
import type { IPaymentGateway } from './providers/payment-gateway.interface';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import {
  CreatePaymentLinkResponse,
  PaymentDetailResponse,
  PaymentListResponse,
  PopularInvitationTemplatesResponse,
  PublicInvitationDetailsByCodeResponse,
} from './types/payment.types';
import {
  FREE_INVITATION_TEMPLATE_SLUGS_LOWER,
  invitationTemplateDisplayName,
} from './invitation-templates.catalog';
import { mapPaymentToUserListItem } from './utils/user-payment-list.mapper';

function coerceInvitationWeddingDate(
  value: Date | string | null | undefined,
): Date | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function invitationWeddingDateIso(
  value: Date | string | null | undefined,
): string | null {
  const date = coerceInvitationWeddingDate(value);
  if (!date) {
    return null;
  }
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return date.toISOString();
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @InjectRepository(PaymentInvitationDetailsEntity)
    private readonly invitationDetailsRepository: Repository<PaymentInvitationDetailsEntity>,
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

  /**
   * Top template thiệp theo số lần xuất hiện trong `payment_invitation_details`
   * (không có metric “lượt xem”; đây là proxy “được chọn / tạo” nhiều nhất).
   * Hòa `usageCount`: template trả phí (mất phí) xếp trước template miễn phí.
   */
  async getTopInvitationTemplatesByUsage(
    limitRaw?: string,
  ): Promise<PopularInvitationTemplatesResponse> {
    const parsed =
      limitRaw != null && String(limitRaw).trim() !== ''
        ? Number(limitRaw)
        : 4;
    const limit = Math.min(
      Math.max(Number.isFinite(parsed) ? Math.floor(parsed) : 4, 1),
      10,
    );

    const qb = this.invitationDetailsRepository
      .createQueryBuilder('d')
      .select('LOWER(TRIM(d.templateSlug))', 'templateSlug')
      .addSelect('COUNT(*)', 'usageCount')
      .where('d.templateSlug IS NOT NULL')
      .andWhere("TRIM(d.templateSlug) <> ''")
      .groupBy('LOWER(TRIM(d.templateSlug))')
      .orderBy('COUNT(*)', 'DESC');

    const freeSlugs = [...FREE_INVITATION_TEMPLATE_SLUGS_LOWER];
    if (freeSlugs.length > 0) {
      qb.addOrderBy(
        'CASE WHEN LOWER(TRIM(d.templateSlug)) IN (:...freeSlugs) THEN 1 ELSE 0 END',
        'ASC',
      ).setParameter('freeSlugs', freeSlugs);
    }

    const rows = await qb
      .addOrderBy('LOWER(TRIM(d.templateSlug))', 'ASC')
      .limit(limit)
      .getRawMany<{ templateSlug: string; usageCount: string }>();

    return {
      items: rows.map((r) => ({
        templateSlug: r.templateSlug,
        usageCount: Number(r.usageCount),
        templateName: invitationTemplateDisplayName(r.templateSlug),
      })),
    };
  }

  async getPublicInvitationDetailsByCode(
    rawCode: string,
  ): Promise<PublicInvitationDetailsByCodeResponse> {
    const code = rawCode?.trim();
    if (!code) {
      throw new BadRequestException({
        message: 'Thiếu mã thiệp (code)',
        messageCode: 'MSG_INVITE_CODE_REQUIRED',
      });
    }

    const details = await this.invitationDetailsRepository.findOne({
      where: { code },
    });
    if (!details) {
      throw new NotFoundException({
        message: 'Không tìm thấy thiệp với mã này',
        messageCode: 'MSG_INVITE_NOT_FOUND',
      });
    }

    const albumRaw = details.album ?? [];
    const albumSorted = [...albumRaw].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );

    return {
      code: details.code,
      templateSlug: details.templateSlug ?? null,
      version: details.version,
      brideName: details.brideName,
      groomName: details.groomName,
      weddingDate: invitationWeddingDateIso(details.weddingDate),
      venue: details.venue ?? null,
      album: albumSorted.map((item) => ({
        url: this.s3Service.resolvePublicObjectUrl(item.storageKey),
        caption: item.caption ?? null,
        sortOrder:
          typeof item.sortOrder === 'number' && Number.isFinite(item.sortOrder)
            ? item.sortOrder
            : null,
      })),
      createdAt: details.createdAt.toISOString(),
      updatedAt: details.updatedAt.toISOString(),
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
