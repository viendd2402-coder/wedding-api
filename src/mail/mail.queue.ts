export const MAIL_QUEUE_NAME = 'mail';

export const MAIL_JOB_SEND_RESET_PASSWORD = 'send-reset-password';

export type SendResetPasswordMailJobData = {
  email: string;
  resetToken: string;
  expiresAtIso: string;
};
