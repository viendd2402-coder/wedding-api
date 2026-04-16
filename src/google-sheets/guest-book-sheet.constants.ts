/** Tab 1: khách xác nhận có đến dự tiệc hay không. */
export const GUEST_BOOK_RSVP_TAB_TITLE = 'Xác nhận tham dự';

/** Tab 2: lời chúc gửi cô dâu chú rể. */
export const GUEST_BOOK_WISHES_TAB_TITLE =
  'Gửi lời chúc tới cô dâu chú rể';

export const GUEST_BOOK_RSVP_HEADERS = [
  'Họ và tên',
  'Số điện thoại',
  'Số khách đi cùng',
  'Có tham dự',
  'Ghi chú',
] as const;

export const GUEST_BOOK_WISH_HEADERS = [
  'Họ và tên (tuỳ chọn)',
  'Lời chúc',
] as const;

export function quoteSheetRangeA1(tabTitle: string, a1: string): string {
  const escaped = tabTitle.replace(/'/g, "''");
  return `'${escaped}'!${a1}`;
}
