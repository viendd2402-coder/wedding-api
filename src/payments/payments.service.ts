import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { S3Service } from '../storage/s3.service';
import {
  PaymentInvitationAlbumItem,
  PaymentInvitationDetailsEntity,
} from './entities/payment-invitation-details.entity';
import {
  PaymentEntity,
  PaymentProvider,
  PaymentStatus,
} from './entities/payment.entity';
import { ACTIVE_PAYMENT_GATEWAY } from './providers/payment-gateway.tokens';
import type { IPaymentGateway } from './providers/payment-gateway.interface';
import { CreateFreeInvitationDto } from './dto/create-free-invitation.dto';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import {
  CreateFreeInvitationResponse,
  CreatePaymentLinkResponse,
  PaymentDetailResponse,
  PaymentListResponse,
  PopularInvitationTemplatesResponse,
  PublicInvitationDetailsByCodeResponse,
} from './types/payment.types';
import {
  FREE_INVITATION_TEMPLATE_SLUGS_LOWER,
  getInvitationTemplateBySlug,
  invitationTemplateDisplayName,
} from './invitation-templates.catalog';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { generatePaymentOrderCode } from './utils/payment-order-code.util';
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
    private readonly googleSheetsService: GoogleSheetsService,
  ) {}

  createPaymentLink(
    userId: number,
    dto: CreatePaymentLinkDto,
    clientIp: string,
  ): Promise<CreatePaymentLinkResponse> {
    return this.activePaymentGateway.createPaymentLink(userId, dto, clientIp);
  }

  /**
   * Tạo thiệp template miễn phí: không gọi VNPay/PayOS, lưu payment PAID (0đ) + mã thiệp công khai.
   */
  async createFreeInvitation(
    userId: number,
    dto: CreateFreeInvitationDto,
  ): Promise<CreateFreeInvitationResponse> {
    const inv = dto.invitation;
    const templateDef = getInvitationTemplateBySlug(inv.templateSlug);
    if (!templateDef?.isFree) {
      throw new BadRequestException({
        message:
          'Template này không miễn phí. Hãy dùng POST /payments/payment-link để thanh toán.',
        messageCode: 'MSG_TEMPLATE_NOT_FREE',
      });
    }

    const providerOrderCode = String(generatePaymentOrderCode());
    const code = randomBytes(16).toString('hex');

    let weddingDate: Date | null = null;
    if (inv.weddingDate?.trim()) {
      const parsed = new Date(inv.weddingDate.trim());
      weddingDate = Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    let album: PaymentInvitationAlbumItem[] | null = null;
    if (inv.album?.length) {
      const items = inv.album
        .map((item): PaymentInvitationAlbumItem | null => {
          const storageKey = item.storageKey?.trim() ?? '';
          if (!storageKey) {
            return null;
          }
          return {
            storageKey: storageKey.slice(0, 500),
            caption:
              typeof item.caption === 'string'
                ? item.caption.slice(0, 500)
                : null,
            ...(typeof item.sortOrder === 'number' &&
            Number.isFinite(item.sortOrder)
              ? { sortOrder: Math.max(0, Math.floor(item.sortOrder)) }
              : {}),
          };
        })
        .filter((x): x is PaymentInvitationAlbumItem => x !== null);
      album = items.length > 0 ? items : null;
    }

    const { response, savedDetails } =
      await this.paymentRepository.manager.transaction(
        async (
          manager,
        ): Promise<{
          response: CreateFreeInvitationResponse;
          savedDetails: PaymentInvitationDetailsEntity;
        }> => {
          const payment = manager.create(PaymentEntity, {
            userId,
            amount: 0,
            currency: 'VND',
            description: `${templateDef.templateName} template`,
            planSlug: inv.templateSlug.trim().toLowerCase(),
            provider: PaymentProvider.FREE,
            providerOrderCode,
            checkoutUrl: null,
            checkoutUrlExpireDate: null,
            status: PaymentStatus.PAID,
            paidAt: new Date(),
            rawWebhook: { source: 'free_invitation' },
            invitationDraft: null,
          });
          const savedPayment = await manager.save(PaymentEntity, payment);

          const details = manager.create(PaymentInvitationDetailsEntity, {
            payment: savedPayment,
            code,
            templateSlug: inv.templateSlug.trim().toLowerCase().slice(0, 120),
            version: Math.max(1, Math.floor(inv.version)),
            brideName: inv.brideName.trim().slice(0, 255),
            groomName: inv.groomName.trim().slice(0, 255),
            weddingDate,
            venue: inv.venue.trim().slice(0, 500),
            album,
          });

          let savedDetails: PaymentInvitationDetailsEntity;
          try {
            savedDetails = await manager.save(
              PaymentInvitationDetailsEntity,
              details,
            );
          } catch (e) {
            if (this.isPgUniqueViolation(e)) {
              throw new BadRequestException({
                message: 'Trùng mã thiệp, vui lòng thử lại.',
                messageCode: 'MSG_FREE_INVITE_CODE_COLLISION',
              });
            }
            throw e;
          }

          return {
            response: {
              paymentId: savedPayment.id,
              orderCode: providerOrderCode,
              inviteCode: code,
              status: PaymentStatus.PAID,
            },
            savedDetails,
          };
        },
      );

    this.googleSheetsService.scheduleGuestBookSpreadsheet(savedDetails);

    return response;
  }

  private isPgUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    );
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
      checkoutUrlExpireDate:
        payment.checkoutUrlExpireDate?.toISOString() ?? null,
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
