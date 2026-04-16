import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  MAIL_JOB_SEND_POST_PAYMENT_THANK_YOU,
  MAIL_QUEUE_NAME,
} from '../../mail.queue';
import { MailSenderService } from '../../mail-sender.service';
import { buildPostPaymentThankYouTemplate } from './post-payment-thank-you.template';
import type { SendPostPaymentThankYouEmailInput } from './post-payment-thank-you.types';

@Injectable()
export class PostPaymentThankYouMailService {
  constructor(
    private readonly mailSenderService: MailSenderService,
    @InjectQueue(MAIL_QUEUE_NAME) private readonly mailQueue: Queue,
  ) {}

  async enqueue(input: SendPostPaymentThankYouEmailInput): Promise<void> {
    await this.mailQueue.add(MAIL_JOB_SEND_POST_PAYMENT_THANK_YOU, input, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
    });
  }

  async send(input: SendPostPaymentThankYouEmailInput): Promise<void> {
    const appName = 'Wedding App';
    const content = buildPostPaymentThankYouTemplate({ appName, input });

    await this.mailSenderService.sendMail({
      to: input.to,
      subject: content.subject,
      text: content.text,
      html: content.html,
      context: 'post-payment',
    });
  }
}
