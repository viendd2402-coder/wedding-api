import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  GOOGLE_SHEETS_APPS_SCRIPT_JOB_APPEND_GUEST_BOOK,
  GOOGLE_SHEETS_APPS_SCRIPT_QUEUE_NAME,
  type GuestBookAppendJobData,
} from './google-sheets-apps-script.queue';

@Injectable()
export class GoogleSheetsAppsScriptQueueService {
  constructor(
    @InjectQueue(GOOGLE_SHEETS_APPS_SCRIPT_QUEUE_NAME)
    private readonly appsScriptQueue: Queue,
  ) {}

  async enqueueGuestBookAppend(data: GuestBookAppendJobData): Promise<void> {
    await this.appsScriptQueue.add(
      GOOGLE_SHEETS_APPS_SCRIPT_JOB_APPEND_GUEST_BOOK,
      data,
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: true,
      },
    );
  }
}
