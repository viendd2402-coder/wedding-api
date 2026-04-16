import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  MAIL_JOB_SEND_RESET_PASSWORD,
  MAIL_QUEUE_NAME,
} from '../../mail.queue';
import { MailSenderService } from '../../mail-sender.service';
import { buildResetPasswordEmailTemplate } from './reset-password.template';

@Injectable()
export class ResetPasswordMailService {
  constructor(
    private readonly configService: ConfigService,
    private readonly mailSenderService: MailSenderService,
    @InjectQueue(MAIL_QUEUE_NAME) private readonly mailQueue: Queue,
  ) {}

  async enqueue(email: string, resetToken: string, expiresAt: Date): Promise<void> {
    await this.mailQueue.add(
      MAIL_JOB_SEND_RESET_PASSWORD,
      {
        email,
        resetToken,
        expiresAtIso: expiresAt.toISOString(),
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
      },
    );
  }

  async send(email: string, resetToken: string, expiresAt: Date): Promise<void> {
    const resetPasswordUrl = this.configService.get<string>(
      'RESET_PASSWORD_URL',
      'http://localhost:3000/reset-password',
    );
    const from = this.mailSenderService.getMailFromAddress();
    const resetUrl = `${resetPasswordUrl}?token=${encodeURIComponent(resetToken)}`;
    const expiresAtDisplay = expiresAt.toLocaleString('vi-VN', {
      hour12: false,
    });
    const appName = 'Wedding App';
    const supportEmail = from;
    const content = buildResetPasswordEmailTemplate({
      appName,
      email,
      resetUrl,
      expiresAtDisplay,
      supportEmail,
    });

    await this.mailSenderService.sendMail({
      to: email,
      subject: content.subject,
      text: content.text,
      html: content.html,
      context: 'reset password',
    });
  }
}
