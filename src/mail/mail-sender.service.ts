import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

@Injectable()
export class MailSenderService {
  private readonly logger = new Logger(MailSenderService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('MAIL_HOST', '').trim();
    const port = this.configService.get<number>('MAIL_PORT', 2525);
    const user = this.configService.get<string>('MAIL_USER', '').trim();
    const pass = this.configService.get<string>('MAIL_PASS', '').trim();

    if (!host || !user || !pass) {
      this.logger.warn('Mail configuration is missing. Emails will not be sent.');
      this.transporter = null;
      return;
    }

    this.transporter = createTransport({
      host,
      port,
      secure: false,
      auth: {
        user,
        pass,
      },
    });
  }

  async sendMail(input: {
    to: string;
    subject: string;
    text: string;
    html: string;
    context: string;
  }): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `Skipped sending ${input.context} email to ${input.to} because mail transporter is not configured.`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.getMailFromAddress(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }

  getMailFromAddress(): string {
    return this.configService.get<string>('MAIL_FROM', 'no-reply@wedding.local');
  }
}
