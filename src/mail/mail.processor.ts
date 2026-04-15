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
    try {
      switch (job.name) {
        case MAIL_JOB_SEND_RESET_PASSWORD:
          await this.handleResetPasswordJob(job);
          return;
        default:
          this.logger.warn(`Unsupported mail job: ${job.name}`);
      }
    } catch (exception: unknown) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      const jobData = job.data as SendResetPasswordMailJobData | undefined;
      this.logger.error(
        `Mail queue job failed | jobId=${String(job.id)} jobName=${String(job.name)} email=${jobData?.email ?? 'n/a'} resetToken=${jobData?.resetToken ? '[redacted]' : 'n/a'} expiresAtIso=${jobData?.expiresAtIso ?? 'n/a'} | ${exception instanceof Error ? `${exception.name}: ${exception.message}` : String(exception)}`,
        stack,
      );
      throw exception;
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
