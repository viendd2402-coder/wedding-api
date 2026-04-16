export const MAIL_QUEUE_NAME = 'mail';

export const MAIL_JOB_SEND_RESET_PASSWORD = 'send-reset-password';
export const MAIL_JOB_SEND_POST_PAYMENT_THANK_YOU =
  'send-post-payment-thank-you';

export type SendResetPasswordMailJobData = {
  email: string;
  resetToken: string;
  expiresAtIso: string;
};

export type SendPostPaymentThankYouMailJobData = {
  to: string;
  invitationCode: string;
  brideName: string;
  groomName: string;
  invitationUrl: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  rsvpTrackingUrl: string;
  wishTrackingUrl: string;
};
