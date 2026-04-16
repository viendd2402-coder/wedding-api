import type { GuestBookAppendTab } from '../dto/append-guest-book.dto';

export const GOOGLE_SHEETS_APPS_SCRIPT_QUEUE_NAME = 'google-sheets-apps-script';

export const GOOGLE_SHEETS_APPS_SCRIPT_JOB_APPEND_GUEST_BOOK =
  'append-guest-book';

export type GuestBookAppendJobData = {
  spreadsheetId: string;
  tab: GuestBookAppendTab;
  row: string[];
};
