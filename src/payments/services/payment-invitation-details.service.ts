import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreatePaymentLinkDto } from '../dto/create-payment-link.dto';
import { PaymentInvitationDetailsEntity } from '../entities/payment-invitation-details.entity';
import { PaymentEntity } from '../entities/payment.entity';
import { PostPaymentQueueService } from '../queues/post-payment-queue.service';
import { tryNormalizeInviteSubdomain } from '../utils/invite-subdomain.util';

@Injectable()
export class PaymentInvitationDetailsService {
  private readonly logger = new Logger(PaymentInvitationDetailsService.name);

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @InjectRepository(PaymentInvitationDetailsEntity)
    private readonly invitationDetailsRepository: Repository<PaymentInvitationDetailsEntity>,
    private readonly postPaymentQueueService: PostPaymentQueueService,
  ) {}

  buildInvitationDraftFromDto(dto: CreatePaymentLinkDto): Record<string, unknown> {
    const inv = dto.invitation!;
    const subdomain = tryNormalizeInviteSubdomain(inv.subdomain);
    return {
      templateSlug: inv.templateSlug ?? null,
      version: inv.version ?? 1,
      brideName: inv.brideName,
      groomName: inv.groomName,
      weddingDate: inv.weddingDate ?? null,
      venue: inv.venue ?? null,
      details:
        inv.details !== undefined && inv.details !== null
          ? (JSON.parse(JSON.stringify(inv.details)) as unknown)
          : null,
      thumbnailImage:
        typeof inv.thumbnailImage === 'string' && inv.thumbnailImage.trim()
          ? inv.thumbnailImage.trim().slice(0, 2000)
          : null,
      ...(subdomain ? { subdomain } : {}),
    };
  }

  /**
   * Gọi trước khi tạo link thanh toán / thiệp miễn phí: chuẩn hóa và kiểm tra subdomain chưa gán.
   */
  async assertSubdomainOptionalForCheckout(raw: unknown): Promise<string | null> {
    if (raw == null || (typeof raw === 'string' && !raw.trim())) {
      return null;
    }
    if (typeof raw !== 'string') {
      throw new BadRequestException({
        message: 'Subdomain thiệp không hợp lệ.',
        messageCode: 'MSG_INVITE_SUBDOMAIN_INVALID',
      });
    }
    const normalized = tryNormalizeInviteSubdomain(raw);
    if (!normalized) {
      throw new BadRequestException({
        message:
          'Subdomain chỉ gồm chữ thường, số, gạch giữa (1–63 ký tự), không trùng từ khóa hệ thống (www, api, …).',
        messageCode: 'MSG_INVITE_SUBDOMAIN_INVALID',
      });
    }
    const exists = await this.invitationDetailsRepository.exist({
      where: { subdomain: normalized },
    });
    if (exists) {
      throw new BadRequestException({
        message: 'Subdomain này đã được đăng ký.',
        messageCode: 'MSG_INVITE_SUBDOMAIN_TAKEN',
      });
    }
    return normalized;
  }

  async persistInvitationDetailsAfterPaidSafe(
    paymentId: number,
    source: 'vnpay' | 'payos',
  ): Promise<void> {
    try {
      await this.persistInvitationDetailsAfterPaid(paymentId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `${source.toUpperCase()} lưu thiệp cưới thất bại paymentId=${paymentId}: ${msg}`,
        e instanceof Error ? e.stack : undefined,
      );
    }
  }

  private async persistInvitationDetailsAfterPaid(paymentId: number): Promise<void> {
    if (await this.hasExistingInvitationDetails(paymentId)) {
      return;
    }

    const paymentWithDraft = await this.findPaymentWithDraft(paymentId);
    if (!paymentWithDraft) {
      return;
    }
    const { payment, draft } = paymentWithDraft;

    const brideName = typeof draft.brideName === 'string' ? draft.brideName : '';
    const groomName = typeof draft.groomName === 'string' ? draft.groomName : '';
    if (!brideName.trim() || !groomName.trim()) {
      this.logger.warn(
        `Invitation draft thiếu tên cô dâu/chú rể paymentId=${paymentId}`,
      );
      return;
    }

    const code = randomBytes(16).toString('hex');
    const weddingDate = this.parseWeddingDateFromDraft(draft);
    const version = this.resolveVersionFromDraft(draft);
    const detailsJson = this.extractDetailsFromDraft(draft);
    const thumbnailImage = this.extractThumbnailImageFromDraft(draft);

    let resolvedSubdomain = tryNormalizeInviteSubdomain(draft.subdomain);
    if (resolvedSubdomain) {
      const taken = await this.invitationDetailsRepository.exist({
        where: { subdomain: resolvedSubdomain },
      });
      if (taken) {
        this.logger.warn(
          `Bỏ subdomain "${resolvedSubdomain}" khi lưu thiệp (đã tồn tại) paymentId=${paymentId}`,
        );
        resolvedSubdomain = null;
      }
    }

    const baseFields = {
      payment,
      code,
      templateSlug:
        typeof draft.templateSlug === 'string'
          ? draft.templateSlug.slice(0, 120)
          : null,
      version,
      brideName: brideName.slice(0, 255),
      groomName: groomName.slice(0, 255),
      weddingDate,
      venue: typeof draft.venue === 'string' ? draft.venue.slice(0, 500) : null,
      details: detailsJson,
      thumbnailImage,
    };

    let details = this.invitationDetailsRepository.create({
      ...baseFields,
      subdomain: resolvedSubdomain ?? null,
    });

    try {
      await this.invitationDetailsRepository.save(details);
    } catch (e) {
      if (!this.isPgUniqueViolation(e)) {
        throw e;
      }
      if (resolvedSubdomain) {
        this.logger.warn(
          `Lưu thiệp trùng unique (subdomain?), thử lại không subdomain paymentId=${paymentId}`,
        );
        details = this.invitationDetailsRepository.create({
          ...baseFields,
          subdomain: null,
        });
        try {
          await this.invitationDetailsRepository.save(details);
        } catch (e2) {
          if (this.isPgUniqueViolation(e2)) {
            return;
          }
          throw e2;
        }
      } else {
        return;
      }
    }

    await this.postPaymentQueueService.enqueueProvisionInvitationResources(details.id);

    payment.invitationDraft = null;
    await this.paymentRepository.save(payment);
  }

  private isPgUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { driverError?: { code?: string } }).driverError
        ?.code === '23505'
    );
  }

  private async hasExistingInvitationDetails(paymentId: number): Promise<boolean> {
    const existing = await this.invitationDetailsRepository.findOne({
      where: { payment: { id: paymentId } },
    });
    return Boolean(existing);
  }

  private async findPaymentWithDraft(
    paymentId: number,
  ): Promise<{ payment: PaymentEntity; draft: Record<string, unknown> } | null> {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
    if (!payment?.invitationDraft || typeof payment.invitationDraft !== 'object') {
      return null;
    }
    return { payment, draft: payment.invitationDraft as Record<string, unknown> };
  }

  private parseWeddingDateFromDraft(draft: Record<string, unknown>): Date | null {
    if (typeof draft.weddingDate !== 'string' || !draft.weddingDate.trim()) {
      return null;
    }
    const parsed = new Date(draft.weddingDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private resolveVersionFromDraft(draft: Record<string, unknown>): number {
    return typeof draft.version === 'number' &&
      Number.isFinite(draft.version) &&
      draft.version >= 1
      ? Math.floor(draft.version)
      : 1;
  }

  private extractDetailsFromDraft(draft: Record<string, unknown>): unknown | null {
    if (!('details' in draft) || draft.details === undefined || draft.details === null) {
      return null;
    }
    try {
      return JSON.parse(JSON.stringify(draft.details)) as unknown;
    } catch {
      return null;
    }
  }

  private extractThumbnailImageFromDraft(draft: Record<string, unknown>): string | null {
    const v = draft.thumbnailImage;
    if (typeof v !== 'string' || !v.trim()) {
      return null;
    }
    return v.trim().slice(0, 2000);
  }
}
