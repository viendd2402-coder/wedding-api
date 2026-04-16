import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { GoogleSheetsService } from '../google-sheets.service';
import {
  GOOGLE_SHEETS_APPS_SCRIPT_JOB_APPEND_GUEST_BOOK,
  GOOGLE_SHEETS_APPS_SCRIPT_QUEUE_NAME,
  type GuestBookAppendJobData,
} from './google-sheets-apps-script.queue';

@Processor(GOOGLE_SHEETS_APPS_SCRIPT_QUEUE_NAME)
export class GoogleSheetsAppsScriptProcessor extends WorkerHost {
  private readonly logger = new Logger(GoogleSheetsAppsScriptProcessor.name);

  constructor(private readonly googleSheetsService: GoogleSheetsService) {
    super();
  }

  async process(job: Job<GuestBookAppendJobData>): Promise<void> {
    switch (job.name) {
      case GOOGLE_SHEETS_APPS_SCRIPT_JOB_APPEND_GUEST_BOOK:
        await this.googleSheetsService.processQueuedGuestBookAppend(job.data);
        return;
      default:
        this.logger.warn(`Unsupported google-sheets-apps-script job: ${job.name}`);
    }
  }
}
