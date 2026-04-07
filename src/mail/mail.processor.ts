import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  MAIL_JOB_SEND_RESET_PASSWORD,
  MAIL_QUEUE_NAME,
  SendResetPasswordMailJobData,
} from './mail.queue';
import { MailService } from './mail.service';

@Processor(MAIL_QUEUE_NAME)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);
  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<SendResetPasswordMailJobData>): Promise<void> {
    switch (job.name) {
      case MAIL_JOB_SEND_RESET_PASSWORD:
        await this.handleResetPasswordJob(job);
        return;
      default:
        this.logger.warn(`Unsupported mail job: ${job.name}`);
    }
  }

  private async handleResetPasswordJob(
    job: Job<SendResetPasswordMailJobData>,
  ): Promise<void> {
    const { email, resetToken, expiresAtIso } = job.data;
    const expiresAt = new Date(expiresAtIso);

    await this.mailService.sendResetPasswordEmailNow(
      email,
      resetToken,
      expiresAt,
    );
  }
}
