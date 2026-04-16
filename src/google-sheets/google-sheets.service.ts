import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PaymentInvitationDetailsEntity } from '../payments/entities/payment-invitation-details.entity';
import {
  GUEST_BOOK_RSVP_HEADERS,
  GUEST_BOOK_RSVP_TAB_TITLE,
  GUEST_BOOK_WISH_HEADERS,
  GUEST_BOOK_WISHES_TAB_TITLE,
} from './guest-book-sheet.constants';
import {
  AppendGuestBookDto,
  GuestBookAppendTab,
} from './dto/append-guest-book.dto';
import { GoogleSheetsAppsScriptQueueService } from './queues/google-sheets-apps-script-queue.service';
import type { GuestBookAppendJobData } from './queues/google-sheets-apps-script.queue';
import type {
  GoogleSheetsAppendResponse,
  GoogleSheetsAuthTestResponse,
} from './google-sheets.types.js';

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private static readonly SPREADSHEET_URL_PREFIX =
    'https://docs.google.com/spreadsheets/d/';

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(PaymentInvitationDetailsEntity)
    private readonly invitationDetailsRepository: Repository<PaymentInvitationDetailsEntity>,
    private readonly appsScriptQueueService: GoogleSheetsAppsScriptQueueService,
  ) {}

  /**
   * Tạo Google Sheet (2 tab + hàng tiêu đề) qua Apps Script webhook.
   * Bỏ qua nếu thiếu URL/secret hoặc đã có `guestBookSpreadsheetId`.
   */
  scheduleGuestBookSpreadsheet(
    details: PaymentInvitationDetailsEntity,
  ): void {
    void this.ensureGuestBookSpreadsheet(details).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Không tạo được Google Sheet khách mời (invitationDetailsId=${details.id}): ${msg}`,
        err instanceof Error ? err.stack : undefined,
      );
    });
  }

  async ensureGuestBookSpreadsheetByInvitationDetailsId(
    invitationDetailsId: number,
  ): Promise<{ spreadsheetId: string; spreadsheetUrl: string } | null> {
    const row = await this.invitationDetailsRepository.findOne({
      where: { id: invitationDetailsId },
    });
    if (!row) {
      return null;
    }

    const existingSheetId = row.guestBookSpreadsheetId?.trim();
    if (existingSheetId) {
      return {
        spreadsheetId: existingSheetId,
        spreadsheetUrl: this.buildSpreadsheetUrl(existingSheetId),
      };
    }

    const cfg = this.resolveAppsScriptConfig();
    if (!cfg) {
      this.logger.warn(
        'Bỏ qua tạo Google Sheet: thiếu GOOGLE_SHEETS_APPS_SCRIPT_URL hoặc GOOGLE_SHEETS_APPS_SCRIPT_SECRET',
      );
      return null;
    }

    const title = this.buildSpreadsheetTitle(row.brideName, row.groomName);
    const { spreadsheetId, spreadsheetUrl } = await this.postAppsScriptCreateSheet(
      title,
      cfg,
    );

    const updateResult = await this.invitationDetailsRepository.update(
      { id: row.id, guestBookSpreadsheetId: IsNull() },
      { guestBookSpreadsheetId: spreadsheetId },
    );

    if (!updateResult.affected) {
      const latest = await this.invitationDetailsRepository.findOne({
        where: { id: row.id },
      });
      const latestSheetId = latest?.guestBookSpreadsheetId?.trim();
      if (latestSheetId) {
        return {
          spreadsheetId: latestSheetId,
          spreadsheetUrl: this.buildSpreadsheetUrl(latestSheetId),
        };
      }
      this.logger.warn(
        `Đã tạo Sheet spreadsheetId=${spreadsheetId} nhưng không gắn được DB (invitationDetailsId=${row.id}).`,
      );
    }

    return { spreadsheetId, spreadsheetUrl };
  }

  private async ensureGuestBookSpreadsheet(
    details: PaymentInvitationDetailsEntity,
  ): Promise<void> {
    const row = await this.invitationDetailsRepository.findOne({
      where: { id: details.id },
    });
    if (!row || row.guestBookSpreadsheetId?.trim()) {
      return;
    }

    const cfg = this.resolveAppsScriptConfig();
    if (!cfg) {
      this.logger.warn(
        'Bỏ qua tạo Google Sheet: thiếu GOOGLE_SHEETS_APPS_SCRIPT_URL hoặc GOOGLE_SHEETS_APPS_SCRIPT_SECRET',
      );
      return;
    }

    const title = this.buildSpreadsheetTitle(row.brideName, row.groomName);
    const { spreadsheetId } = await this.createSheetViaAppsScript(title);

    const updateResult = await this.invitationDetailsRepository.update(
      { id: row.id, guestBookSpreadsheetId: IsNull() },
      { guestBookSpreadsheetId: spreadsheetId },
    );

    if (!updateResult.affected) {
      this.logger.warn(
        `Đã tạo Sheet spreadsheetId=${spreadsheetId} nhưng không gắn được DB (invitationDetailsId=${row.id}, có thể đã có bản ghi khác).`,
      );
    }
  }

  private buildSpreadsheetTitle(brideName: string, groomName: string): string {
    const raw = `Wedding — ${groomName.trim()} & ${brideName.trim()}`;
    return raw.length > 100 ? `${raw.slice(0, 97)}...` : raw;
  }

  private buildSpreadsheetUrl(spreadsheetId: string): string {
    return `${GoogleSheetsService.SPREADSHEET_URL_PREFIX}${encodeURIComponent(spreadsheetId)}/edit`;
  }

  private resolveAppsScriptConfig(): { url: string; secret: string } | null {
    const url = this.configService
      .get<string>('GOOGLE_SHEETS_APPS_SCRIPT_URL', '')
      ?.trim();
    const secret = this.configService
      .get<string>('GOOGLE_SHEETS_APPS_SCRIPT_SECRET', '')
      ?.trim();
    if (!url || !secret) {
      return null;
    }
    return { url, secret };
  }

  private requireAppsScriptConfig(): { url: string; secret: string } {
    const cfg = this.resolveAppsScriptConfig();
    if (!cfg) {
      throw new ServiceUnavailableException(
        'Thiếu GOOGLE_SHEETS_APPS_SCRIPT_URL hoặc GOOGLE_SHEETS_APPS_SCRIPT_SECRET.',
      );
    }
    return cfg;
  }

  private async callAppsScript(
    cfg: { url: string; secret: string },
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const bodyPayload = { ...payload, secret: cfg.secret };
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': cfg.secret,
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Apps Script HTTP ${res.status}: ${body.slice(0, 500)}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    const rawBody = await res.text();
    if (!contentType.toLowerCase().includes('application/json')) {
      const preview = rawBody.slice(0, 400);
      throw new Error(
        `Apps Script trả không phải JSON (content-type=${contentType || 'unknown'}). Preview: ${preview}`,
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(rawBody) as unknown;
    } catch {
      throw new Error(
        `Apps Script body không parse được JSON. Preview: ${rawBody.slice(0, 400)}`,
      );
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Apps Script trả về dữ liệu không hợp lệ');
    }

    const record = data as Record<string, unknown>;
    if (record.ok === false) {
      const errMsg =
        typeof record.error === 'string' ? record.error : 'Apps Script báo lỗi';
      throw new Error(errMsg);
    }

    return record;
  }

  private async postAppsScriptCreateSheet(
    title: string,
    cfg: { url: string; secret: string },
  ): Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
  }> {
    const editorEmail = this.configService
      .get<string>('GOOGLE_SHEETS_EDITOR_EMAIL', '')
      ?.trim();

    const record = await this.callAppsScript(cfg, {
      action: 'create',
      title,
      shareToEmail: editorEmail || undefined,
      sheets: [
        {
          title: GUEST_BOOK_RSVP_TAB_TITLE,
          headers: Array.from(GUEST_BOOK_RSVP_HEADERS),
        },
        {
          title: GUEST_BOOK_WISHES_TAB_TITLE,
          headers: Array.from(GUEST_BOOK_WISH_HEADERS),
        },
      ],
    });

    const spreadsheetId =
      typeof record.spreadsheetId === 'string'
        ? record.spreadsheetId.trim()
        : '';
    const spreadsheetUrlRaw =
      typeof record.spreadsheetUrl === 'string'
        ? record.spreadsheetUrl.trim()
        : typeof record.url === 'string'
          ? record.url.trim()
          : '';
    if (!spreadsheetId || !spreadsheetUrlRaw) {
      throw new Error(
        'Apps Script thiếu spreadsheetId/spreadsheetUrl trong response',
      );
    }
    return {
      spreadsheetId,
      spreadsheetUrl: spreadsheetUrlRaw,
    };
  }

  async appendGuestBookRow(
    dto: AppendGuestBookDto,
  ): Promise<GoogleSheetsAppendResponse> {
    this.requireAppsScriptConfig();
    const id = dto.spreadsheetId.trim();
    if (!id) {
      throw new BadRequestException('spreadsheetId không hợp lệ');
    }

    let row: string[];
    if (dto.tab === GuestBookAppendTab.RSVP) {
      if (!dto.rsvp) {
        throw new BadRequestException('Thiếu object rsvp khi tab=rsvp');
      }
      const r = dto.rsvp;
      row = [
        r.fullName.trim(),
        r.phone.trim(),
        r.guestCount.trim(),
        r.willAttend.trim(),
        (r.note ?? '').trim(),
      ];
    } else {
      if (!dto.wish) {
        throw new BadRequestException('Thiếu object wish khi tab=wish');
      }
      const w = dto.wish;
      row = [(w.displayName ?? '').trim(), w.message.trim()];
    }

    try {
      await this.appsScriptQueueService.enqueueGuestBookAppend({
        spreadsheetId: id,
        tab: dto.tab,
        row,
      });
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException(
        `Không xếp hàng được append vào Sheet: ${msg}`,
      );
    }
  }

  /**
   * Worker BullMQ: gọi Apps Script append (có retry theo cấu hình job).
   */
  async processQueuedGuestBookAppend(data: GuestBookAppendJobData): Promise<void> {
    const cfg = this.requireAppsScriptConfig();
    const id = data.spreadsheetId.trim();
    if (!id) {
      throw new Error('spreadsheetId rỗng trong job append');
    }
    const record = await this.callAppsScript(cfg, {
      action: 'append',
      spreadsheetId: id,
      tab: data.tab,
      row: data.row,
    });
    if (record.ok !== true) {
      throw new Error('Apps Script không xác nhận append');
    }
  }

  async createSheetViaAppsScript(title: string): Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
  }> {
    const cfg = this.resolveAppsScriptConfig();
    if (!cfg) {
      throw new ServiceUnavailableException(
        'Thiếu GOOGLE_SHEETS_APPS_SCRIPT_URL hoặc GOOGLE_SHEETS_APPS_SCRIPT_SECRET.',
      );
    }
    return this.postAppsScriptCreateSheet(title, cfg);
  }

  async createTestSheetViaAppsScript(
    brideName: string,
    groomName: string,
  ): Promise<GoogleSheetsAuthTestResponse> {
    const bride = brideName.trim();
    const groom = groomName.trim();
    if (!bride || !groom) {
      throw new BadRequestException(
        'Thiếu brideName hoặc groomName (query string, không rỗng).',
      );
    }

    const cfg = this.requireAppsScriptConfig();
    const title = this.buildSpreadsheetTitle(bride, groom);
    try {
      const created = await this.postAppsScriptCreateSheet(title, cfg);
      return {
        ok: true,
        credentialSource: 'apps-script',
        clientEmail: 'apps-script-webhook',
        spreadsheetId: created.spreadsheetId,
        spreadsheetUrl: created.spreadsheetUrl,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(
        `Không tạo được Sheet test qua Apps Script: ${msg}`,
      );
    }
  }
}
