import { Injectable } from '@nestjs/common';
import { PostPaymentThankYouMailService } from './mails/post-payment-thank-you/post-payment-thank-you-mail.service';
import type { SendPostPaymentThankYouEmailInput } from './mails/post-payment-thank-you/post-payment-thank-you.types';
import { ResetPasswordMailService } from './mails/reset-password/reset-password-mail.service';

@Injectable()
export class MailService {
  constructor(
    private readonly resetPasswordMailService: ResetPasswordMailService,
    private readonly postPaymentThankYouMailService: PostPaymentThankYouMailService,
  ) {}

  async enqueueResetPasswordEmail(
    email: string,
    resetToken: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.resetPasswordMailService.enqueue(email, resetToken, expiresAt);
  }

  async sendResetPasswordEmailNow(
    email: string,
    resetToken: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.resetPasswordMailService.send(email, resetToken, expiresAt);
  }

  async sendPostPaymentThankYouEmailNow(
    input: SendPostPaymentThankYouEmailInput,
  ): Promise<void> {
    await this.postPaymentThankYouMailService.send(input);
  }

  async enqueuePostPaymentThankYouEmail(
    input: SendPostPaymentThankYouEmailInput,
  ): Promise<void> {
    await this.postPaymentThankYouMailService.enqueue(input);
  }
}
