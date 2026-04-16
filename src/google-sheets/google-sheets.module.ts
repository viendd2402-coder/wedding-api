import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PaymentInvitationDetailsEntity } from '../payments/entities/payment-invitation-details.entity';
import { GoogleSheetsController } from './google-sheets.controller';
import { GoogleSheetsService } from './google-sheets.service';
import { GoogleSheetsAppsScriptProcessor } from './queues/google-sheets-apps-script.processor';
import { GoogleSheetsAppsScriptQueueService } from './queues/google-sheets-apps-script-queue.service';
import { GOOGLE_SHEETS_APPS_SCRIPT_QUEUE_NAME } from './queues/google-sheets-apps-script.queue';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentInvitationDetailsEntity]),
    BullModule.registerQueue({
      name: GOOGLE_SHEETS_APPS_SCRIPT_QUEUE_NAME,
    }),
    AuthModule,
  ],
  controllers: [GoogleSheetsController],
  providers: [
    GoogleSheetsService,
    GoogleSheetsAppsScriptQueueService,
    GoogleSheetsAppsScriptProcessor,
  ],
  exports: [GoogleSheetsService],
})
export class GoogleSheetsModule {}
