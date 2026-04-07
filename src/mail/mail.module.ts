import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
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
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
