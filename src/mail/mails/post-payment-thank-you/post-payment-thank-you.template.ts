import type { SendPostPaymentThankYouEmailInput } from './post-payment-thank-you.types';

type BuildPostPaymentThankYouTemplateInput = {
  appName: string;
  input: SendPostPaymentThankYouEmailInput;
};

export function buildPostPaymentThankYouTemplate({
  appName,
  input,
}: BuildPostPaymentThankYouTemplateInput): {
  subject: string;
  text: string;
  html: string;
} {
  return {
    subject: `[${appName}] Cảm ơn bạn đã thanh toán`,
    text: [
      'Xin chào,',
      '',
      `Cảm ơn bạn đã thanh toán và kích hoạt thiệp cưới cho ${input.groomName} & ${input.brideName}.`,
      'Thông tin chi tiết:',
      `- Link thiệp: ${input.invitationUrl}`,
      `- Link theo dõi xác nhận tham dự: ${input.rsvpTrackingUrl}`,
      `- Link theo dõi lời chúc: ${input.wishTrackingUrl}`,
      '',
      'Hệ thống đã tạo file Google Sheet để theo dõi RSVP và lời chúc.',
      `Mã sheet: ${input.spreadsheetId}`,
      `Link theo dõi: ${input.spreadsheetUrl}`,
      `Mã thiệp: ${input.invitationCode}`,
      '',
      'Chúc bạn có một đám cưới thật trọn vẹn!',
      '',
      `Trân trọng, ${appName}`,
    ].join('\n'),
    html: [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.6;">',
      '<h2 style="margin:0 0 12px;">Cảm ơn bạn đã thanh toán!</h2>',
      `<p>Thiệp cưới cho <strong>${input.groomName} &amp; ${input.brideName}</strong> đã được kích hoạt thành công.</p>`,
      '<p style="margin:0 0 8px;"><strong>Link thiệp:</strong> ',
      `<a href="${input.invitationUrl}" style="color:#2563eb;text-decoration:none;">${input.invitationUrl}</a></p>`,
      '<p style="margin:0 0 8px;"><strong>Link theo dõi xác nhận tham dự:</strong> ',
      `<a href="${input.rsvpTrackingUrl}" style="color:#2563eb;text-decoration:none;">Mở tab Xác nhận tham dự</a></p>`,
      '<p style="margin:0 0 16px;"><strong>Link theo dõi lời chúc:</strong> ',
      `<a href="${input.wishTrackingUrl}" style="color:#2563eb;text-decoration:none;">Mở tab Gửi lời chúc tới cô dâu chú rể</a></p>`,
      '<p>Hệ thống đã tạo file Google Sheet để bạn theo dõi RSVP và lời chúc:</p>',
      `<p style="margin:0 0 8px;"><strong>Mã sheet:</strong> ${input.spreadsheetId}</p>`,
      `<p style="margin:0 0 16px;"><a href="${input.spreadsheetUrl}" style="color:#2563eb;text-decoration:none;">Mở file Google Sheet</a></p>`,
      `<p style="margin:0;"><strong>Mã thiệp:</strong> ${input.invitationCode}</p>`,
      '<p style="margin:16px 0 0;">Chúc bạn có một đám cưới thật trọn vẹn!</p>',
      '</div>',
    ].join(''),
  };
}
