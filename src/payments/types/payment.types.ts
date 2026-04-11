import { PaymentStatus } from '../entities/payment.entity';

export type UserPaymentProductType = 'free' | 'paid';

export type InvitationPublicationStatus = 'published' | 'draft';

/** Dữ liệu tối thiểu cho danh sách thiệp / payment trên dashboard. */
export type UserPaymentListItemResponse = {
  id: number;
  paymentStatus: PaymentStatus;
  paymentType: UserPaymentProductType;
  thumbnailUrl: string | null;
  templateName: string;
  publicationStatus: InvitationPublicationStatus;
  updatedAt: string;
  eventTitle: string | null;
  eventDateIso: string | null;
  eventDateLabel: string | null;
  venueDetail: string | null;
  invitePath: string | null;
};

export type CreatePaymentLinkResponse = {
  paymentId: number;
  checkoutUrl: string;
  orderCode: string;
  status: PaymentStatus;
};

export type PaymentDetailResponse = {
  id: number;
  amount: number;
  currency: string;
  planSlug: string | null;
  description: string | null;
  status: PaymentStatus;
  provider: string;
  orderCode: string;
  checkoutUrl: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
};

export type PaymentListResponse = {
  items: UserPaymentListItemResponse[];
  total: number;
};

export type VnpayIpnResponseBody = {
  RspCode: string;
  Message: string;
};

/** Chi tiết thiệp công khai (theo `code`), dùng cho trang invite không cần đăng nhập. */
export type PublicInvitationAlbumItemResponse = {
  url: string | null;
  caption: string | null;
  sortOrder: number | null;
};

export type PublicInvitationDetailsByCodeResponse = {
  code: string;
  templateSlug: string | null;
  version: number;
  brideName: string;
  groomName: string;
  weddingDate: string | null;
  venue: string | null;
  album: PublicInvitationAlbumItemResponse[];
  createdAt: string;
  updatedAt: string;
};
