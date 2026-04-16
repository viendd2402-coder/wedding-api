import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { MailSenderService } from './mail-sender.service';
import { PostPaymentThankYouMailService } from './mails/post-payment-thank-you/post-payment-thank-you-mail.service';
import { ResetPasswordMailService } from './mails/reset-password/reset-password-mail.service';
import { MailProcessor } from './mail.processor';
import { MAIL_QUEUE_NAME } from './mail.queue';
import { MailService } from './mail.service';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: MAIL_QUEUE_NAME,
    }),
  ],
  providers: [
    MailSenderService,
    ResetPasswordMailService,
    PostPaymentThankYouMailService,
    MailService,
    MailProcessor,
  ],
  exports: [MailService],
})
export class MailModule {}
