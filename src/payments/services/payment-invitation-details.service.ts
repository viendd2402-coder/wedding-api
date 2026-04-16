import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreatePaymentLinkDto } from '../dto/create-payment-link.dto';
import {
  PaymentInvitationAlbumItem,
  PaymentInvitationDetailsEntity,
} from '../entities/payment-invitation-details.entity';
import { PaymentEntity } from '../entities/payment.entity';
import { PostPaymentQueueService } from '../queues/post-payment-queue.service';

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
    const album = this.extractAlbumFromDraft(draft);

    const details = this.invitationDetailsRepository.create({
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

  private extractAlbumFromDraft(
    draft: Record<string, unknown>,
  ): PaymentInvitationAlbumItem[] | null {
    if (!Array.isArray(draft.album)) {
      return null;
    }
    const items = draft.album
      .map((item): PaymentInvitationAlbumItem | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const o = item as Record<string, unknown>;
        const storageKey = typeof o.storageKey === 'string' ? o.storageKey : '';
        if (!storageKey) {
          return null;
        }
        return {
          storageKey: storageKey.slice(0, 500),
          caption: typeof o.caption === 'string' ? o.caption.slice(0, 500) : null,
          ...(typeof o.sortOrder === 'number' && Number.isFinite(o.sortOrder)
            ? { sortOrder: Math.max(0, Math.floor(o.sortOrder)) }
            : {}),
        };
      })
      .filter((x): x is PaymentInvitationAlbumItem => x !== null);
    return items.length > 0 ? items : null;
  }
}
