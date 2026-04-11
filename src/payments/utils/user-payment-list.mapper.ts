import type {
  PaymentInvitationAlbumItem,
  PaymentInvitationDetailsEntity,
} from '../entities/payment-invitation-details.entity';
import type { PaymentEntity } from '../entities/payment.entity';
import type {
  InvitationPublicationStatus,
  UserPaymentListItemResponse,
  UserPaymentProductType,
} from '../types/payment.types';
import { invitationTemplateDisplayName } from '../invitation-templates.catalog';

function parseVenueLines(venue: string | null | undefined): {
  city: string | null;
  venueName: string | null;
  venueDetail: string | null;
} {
  if (venue == null) {
    return { city: null, venueName: null, venueDetail: null };
  }
  const parts = venue
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length >= 3) {
    return { city: parts[0]!, venueName: parts[1]!, venueDetail: parts[2]! };
  }
  if (parts.length === 2) {
    return { city: null, venueName: parts[0]!, venueDetail: parts[1]! };
  }
  if (parts.length === 1) {
    return { city: null, venueName: parts[0]!, venueDetail: null };
  }
  return { city: null, venueName: null, venueDetail: null };
}

function pickFirstAlbumStorageKey(
  album: PaymentInvitationAlbumItem[] | null | undefined,
): string | null {
  if (!album?.length) {
    return null;
  }
  const sorted = [...album].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  const key = sorted[0]?.storageKey?.trim();
  return key?.length ? key : null;
}

function parseDraftAlbum(raw: unknown): PaymentInvitationAlbumItem[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const items: PaymentInvitationAlbumItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const o = item as Record<string, unknown>;
    const storageKey = typeof o.storageKey === 'string' ? o.storageKey.trim() : '';
    if (!storageKey) {
      continue;
    }
    items.push({
      storageKey: storageKey.slice(0, 500),
      caption: typeof o.caption === 'string' ? o.caption.slice(0, 500) : null,
      ...(typeof o.sortOrder === 'number' && Number.isFinite(o.sortOrder)
        ? { sortOrder: Math.max(0, Math.floor(o.sortOrder)) }
        : {}),
    });
  }
  return items.length > 0 ? items : null;
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
  album: PaymentInvitationAlbumItem[] | null;
  publicCode: string | null;
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
      album: details.album ?? null,
      publicCode: details.code?.trim() || null,
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

  return {
    templateSlug,
    brideName,
    groomName,
    weddingDate: coerceToDate(d.weddingDate),
    venueRaw,
    album: parseDraftAlbum(d.album),
    publicCode: null,
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
  const thumbKey = pickFirstAlbumStorageKey(inv?.album ?? null);
  const thumbnailUrl = resolvePublicObjectUrl(thumbKey);

  const publicationStatus: InvitationPublicationStatus = details?.code?.trim()
    ? 'published'
    : 'draft';

  const paymentType: UserPaymentProductType =
    payment.amount <= 0 ? 'free' : 'paid';

  const weddingDate = coerceToDate(inv?.weddingDate ?? null);
  const listUpdatedAt = inv?.rowUpdatedAt ?? payment.updatedAt;

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
    checkoutUrl: payment.checkoutUrl?.trim() || null,
    checkoutUrlExpireDate:
      payment.checkoutUrlExpireDate instanceof Date &&
      !Number.isNaN(payment.checkoutUrlExpireDate.getTime())
        ? payment.checkoutUrlExpireDate.toISOString()
        : null,
    templateSlug: inv?.templateSlug?.trim() || null,
  };
}
