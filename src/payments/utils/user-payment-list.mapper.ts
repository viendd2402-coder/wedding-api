import type { PaymentInvitationDetailsEntity } from '../entities/payment-invitation-details.entity';
import type { PaymentEntity } from '../entities/payment.entity';
import type {
  InvitationPublicationStatus,
  UserPaymentListItemResponse,
  UserPaymentProductType,
} from '../types/payment.types';
import { invitationTemplateDisplayName } from '../invitation-templates.catalog';
import { tryNormalizeInviteSubdomain } from './invite-subdomain.util';

function resolveListThumbnailUrl(
  raw: string | null | undefined,
  resolvePublicObjectUrl: (key: string | null | undefined) => string | null,
): string | null {
  const s = raw?.trim();
  if (!s) {
    return null;
  }
  if (/^https?:\/\//i.test(s)) {
    return s;
  }
  return resolvePublicObjectUrl(s);
}

function parseDraftDetails(raw: unknown): unknown | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(raw)) as unknown;
  } catch {
    return null;
  }
}

function coerceToDate(value: unknown): Date | null {
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
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

type InvitationSnapshot = {
  templateSlug: string | null;
  brideName: string | null;
  groomName: string | null;
  weddingDate: Date | null;
  venueRaw: string | null;
  details: unknown | null;
  thumbnailImage: string | null;
  publicCode: string | null;
  publicSubdomain: string | null;
  rowUpdatedAt: Date;
};

function buildInvitationSnapshot(
  payment: PaymentEntity,
  details: PaymentInvitationDetailsEntity | null | undefined,
): InvitationSnapshot | null {
  if (details) {
    return {
      templateSlug: details.templateSlug ?? null,
      brideName: details.brideName?.trim() || null,
      groomName: details.groomName?.trim() || null,
      weddingDate: coerceToDate(details.weddingDate),
      venueRaw: details.venue?.trim() || null,
      details: details.details ?? null,
      thumbnailImage: details.thumbnailImage?.trim() || null,
      publicCode: details.code?.trim() || null,
      publicSubdomain: details.subdomain?.trim() || null,
      rowUpdatedAt: coerceToDate(details.updatedAt) ?? payment.updatedAt,
    };
  }

  const draft = payment.invitationDraft;
  if (!draft || typeof draft !== 'object') {
    return null;
  }
  const d = draft as Record<string, unknown>;
  const brideName =
    typeof d.brideName === 'string' && d.brideName.trim() ? d.brideName.trim() : null;
  const groomName =
    typeof d.groomName === 'string' && d.groomName.trim() ? d.groomName.trim() : null;
  const templateSlug =
    typeof d.templateSlug === 'string' && d.templateSlug.trim()
      ? d.templateSlug.trim()
      : null;
  const venueRaw =
    typeof d.venue === 'string' && d.venue.trim() ? d.venue.trim() : null;
  const thumbnailImage =
    typeof d.thumbnailImage === 'string' && d.thumbnailImage.trim()
      ? d.thumbnailImage.trim()
      : null;

  return {
    templateSlug,
    brideName,
    groomName,
    weddingDate: coerceToDate(d.weddingDate),
    venueRaw,
    details: parseDraftDetails(d.details),
    thumbnailImage,
    publicCode: null,
    publicSubdomain: tryNormalizeInviteSubdomain(d.subdomain),
    rowUpdatedAt: payment.updatedAt,
  };
}

function formatEventDateLabel(date: Date | null): string | null {
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return null;
  }
}

function eventDateIso(date: Date | null): string | null {
  if (!date || Number.isNaN(date.getTime())) {
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

function buildEventTitle(
  groomName: string | null,
  brideName: string | null,
): string | null {
  if (groomName && brideName) {
    return `${groomName} · ${brideName}`;
  }
  return groomName ?? brideName ?? null;
}

/**
 * Map từ entity đã load quan hệ `invitationDetails` (find + relations), không dùng QueryBuilder.
 */
export function mapPaymentToUserListItem(
  payment: PaymentEntity,
  resolvePublicObjectUrl: (key: string | null | undefined) => string | null,
): UserPaymentListItemResponse {
  const details = payment.invitationDetails ?? undefined;
  const inv = buildInvitationSnapshot(payment, details);
  const slugForName =
    inv?.templateSlug?.trim() || payment.planSlug?.trim() || null;
  const templateName = invitationTemplateDisplayName(slugForName);
  const thumbnailUrl = resolveListThumbnailUrl(
    inv?.thumbnailImage ?? null,
    resolvePublicObjectUrl,
  );

  const publicationStatus: InvitationPublicationStatus = details?.code?.trim()
    ? 'published'
    : 'draft';

  const paymentType: UserPaymentProductType =
    payment.amount <= 0 ? 'free' : 'paid';

  const weddingDate = coerceToDate(inv?.weddingDate ?? null);
  const listUpdatedAt = inv?.rowUpdatedAt ?? payment.updatedAt;

  const sheetId = details?.guestBookSpreadsheetId?.trim();
  const guestBookSpreadsheetUrl = sheetId
    ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
    : null;

  return {
    id: payment.id,
    paymentStatus: payment.status,
    paymentType,
    thumbnailUrl,
    templateName,
    publicationStatus,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: listUpdatedAt.toISOString(),
    eventTitle: inv ? buildEventTitle(inv.groomName, inv.brideName) : null,
    eventDateIso: eventDateIso(weddingDate),
    eventDateLabel: formatEventDateLabel(weddingDate),
    venueDetail: inv?.venueRaw ?? null,
    invitePath: inv?.publicCode ? `/invite/${inv.publicCode}` : null,
    inviteSubdomain: inv?.publicSubdomain ?? null,
    guestBookSpreadsheetUrl,
    checkoutUrl: payment.checkoutUrl?.trim() || null,
    checkoutUrlExpireDate:
      payment.checkoutUrlExpireDate instanceof Date &&
      !Number.isNaN(payment.checkoutUrlExpireDate.getTime())
        ? payment.checkoutUrlExpireDate.toISOString()
        : null,
    templateSlug: inv?.templateSlug?.trim() || null,
  };
}
