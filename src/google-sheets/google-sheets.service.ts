import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { JWT } from 'google-auth-library';
import { GaxiosError } from 'gaxios';
import { google } from 'googleapis';
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { IsNull, Repository } from 'typeorm';
import { PaymentInvitationDetailsEntity } from '../payments/entities/payment-invitation-details.entity';
import {
  GUEST_BOOK_RSVP_HEADERS,
  GUEST_BOOK_RSVP_TAB_TITLE,
  GUEST_BOOK_WISH_HEADERS,
  GUEST_BOOK_WISHES_TAB_TITLE,
  quoteSheetRangeA1,
} from './guest-book-sheet.constants';
import type { GoogleSheetsAuthTestResponse } from './google-sheets.types.js';

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(PaymentInvitationDetailsEntity)
    private readonly invitationDetailsRepository: Repository<PaymentInvitationDetailsEntity>,
  ) {}

  /**
   * Tạo Google Sheet (2 tab + hàng tiêu đề) nền, không chặn webhook thanh toán.
   * Bỏ qua nếu thiếu cấu hình service account (file hoặc env) hoặc đã có `guestBookSpreadsheetId`.
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

  private async ensureGuestBookSpreadsheet(
    details: PaymentInvitationDetailsEntity,
  ): Promise<void> {
    const row = await this.invitationDetailsRepository.findOne({
      where: { id: details.id },
    });
    if (!row || row.guestBookSpreadsheetId?.trim()) {
      return;
    }

    const auth = this.buildSheetsJwt();
    if (!auth) {
      this.logger.warn(
        'Bỏ qua tạo Google Sheet: chưa cấu hình GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_PATH hoặc GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON',
      );
      return;
    }

    await auth.authorize();

    const sheets = google.sheets({ version: 'v4', auth });
    const title = this.buildSpreadsheetTitle(row.brideName, row.groomName);

    const created = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: [
          { properties: { title: GUEST_BOOK_RSVP_TAB_TITLE } },
          { properties: { title: GUEST_BOOK_WISHES_TAB_TITLE } },
        ],
      },
    });

    const spreadsheetId = created.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Google Sheets create: thiếu spreadsheetId');
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: quoteSheetRangeA1(GUEST_BOOK_RSVP_TAB_TITLE, 'A1:E1'),
            values: [Array.from(GUEST_BOOK_RSVP_HEADERS)],
          },
          {
            range: quoteSheetRangeA1(GUEST_BOOK_WISHES_TAB_TITLE, 'A1:B1'),
            values: [Array.from(GUEST_BOOK_WISH_HEADERS)],
          },
        ],
      },
    });

    await this.shareSpreadsheetIfConfigured(auth, spreadsheetId);

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
    const raw = `Khách mời — ${groomName.trim()} & ${brideName.trim()}`;
    return raw.length > 100 ? `${raw.slice(0, 97)}...` : raw;
  }

  /**
   * Đọc JSON service account: ưu tiên file (`GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_PATH`),
   * nếu không đọc được thì dùng biến `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`.
   */
  private resolveServiceAccountJson():
    | { raw: string; source: 'file' | 'env' }
    | null {
    const pathRaw = this.configService
      .get<string>('GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_PATH', '')
      ?.trim();
    if (pathRaw) {
      try {
        const resolved = isAbsolute(pathRaw) ? pathRaw : join(process.cwd(), pathRaw);
        const raw = readFileSync(resolved, 'utf8').trim();
        if (raw) {
          return { raw, source: 'file' };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Không đọc được GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_PATH (${pathRaw}): ${msg}`,
        );
      }
    }

    const envRaw = this.configService
      .get<string>('GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON', '')
      ?.trim();
    if (envRaw) {
      return { raw: envRaw, source: 'env' };
    }
    return null;
  }

  private parseServiceAccountKeys(raw: string): {
    client_email: string;
    private_key: string;
  } | null {
    let parsed: { client_email?: string; private_key?: string };
    try {
      parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
    } catch {
      this.logger.warn('Service account JSON không phải JSON hợp lệ');
      return null;
    }

    const client_email =
      typeof parsed.client_email === 'string' ? parsed.client_email.trim() : '';
    const private_key =
      typeof parsed.private_key === 'string' ? parsed.private_key.trim() : '';
    if (!client_email || !private_key) {
      this.logger.warn('Service account JSON thiếu client_email hoặc private_key');
      return null;
    }
    return { client_email, private_key };
  }

  private createSheetsJwt(clientEmail: string, privateKey: string): JWT {
    return new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        // `drive.file` đôi khi không đủ cho tạo/chia sẻ Sheet qua API; `drive` phù hợp server-side SA.
        'https://www.googleapis.com/auth/drive',
      ],
    });
  }

  /** Chuỗi gợi ý dựa trên payload lỗi Google (AIP-193). */
  private hintsForSheetsCreateFailure(googleDetail: string): string {
    const u = googleDetail.toUpperCase();
    if (u.includes('SERVICE_DISABLED')) {
      return ' Google báo SERVICE_DISABLED: API chưa bật trên đúng project (đối chiếu `project_id` trong JSON với project đang chọn trên console), hoặc chờ vài phút sau khi bật API.';
    }
    if (u.includes('ACCESS_TOKEN_SCOPE') || u.includes('INSUFFICIENT_SCOPE')) {
      return ' Thiếu OAuth scope: đã dùng scope spreadsheets+drive; restart API sau khi deploy.';
    }
    if (u.includes('CONSUMER_INVALID')) {
      return ' CONSUMER_INVALID thường gặp khi project chưa liên kết billing hoặc project không hợp lệ — kiểm tra Billing & project_id.';
    }
    if (u.includes('PERMISSION_DENIED') || u.includes('PERMISSION')) {
      return ' Vẫn PERMISSION: xác nhận IAM → Service Accounts → email trong JSON không Disabled; nếu công ty dùng Google Workspace, hỏi admin có policy chặn Drive/Sheets cho service account không.';
    }
    return '';
  }

  private formatGoogleClientError(err: unknown): { summary: string; detail?: string } {
    if (err instanceof GaxiosError) {
      const status = err.response?.status;
      const summary =
        status != null ? `${err.message} (HTTP ${status})` : err.message;
      const data = err.response?.data;
      if (data !== null && data !== undefined && typeof data === 'object') {
        let detail = JSON.stringify(data);
        if (detail.length > 1800) {
          detail = `${detail.slice(0, 1800)}…`;
        }
        return { summary, detail };
      }
      return { summary };
    }
    return { summary: err instanceof Error ? err.message : String(err) };
  }

  private buildSheetsJwt(): JWT | null {
    const resolved = this.resolveServiceAccountJson();
    if (!resolved) {
      return null;
    }
    const keys = this.parseServiceAccountKeys(resolved.raw);
    if (!keys) {
      return null;
    }
    return this.createSheetsJwt(keys.client_email, keys.private_key);
  }

  async testSheetsAuth(options?: {
    skipCreate?: boolean;
  }): Promise<GoogleSheetsAuthTestResponse> {
    const skipCreate = Boolean(options?.skipCreate);
    const resolved = this.resolveServiceAccountJson();
    if (!resolved) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình Google Sheets: đặt GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_PATH (file JSON) hoặc GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON.',
      );
    }
    const keys = this.parseServiceAccountKeys(resolved.raw);
    if (!keys) {
      throw new BadRequestException(
        'Service account JSON không hợp lệ (thiếu client_email/private_key hoặc không parse được).',
      );
    }
    const jwt = this.createSheetsJwt(keys.client_email, keys.private_key);
    try {
      await jwt.authorize();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Google Sheets test-auth authorize thất bại: ${msg}`);
      throw new BadGatewayException(`Google từ chối credentials: ${msg}`);
    }

    if (skipCreate) {
      return {
        ok: true,
        credentialSource: resolved.source,
        clientEmail: keys.client_email,
        spreadsheetId: null,
        spreadsheetUrl: null,
      };
    }

    const sheets = google.sheets({ version: 'v4', auth: jwt });
    const title = `Wedding API — test ${new Date().toISOString().slice(0, 19)}Z`;
    let spreadsheetId: string;
    try {
      const created = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title },
        },
      });
      const id = created.data.spreadsheetId;
      if (!id) {
        throw new Error('Google Sheets create: thiếu spreadsheetId');
      }
      spreadsheetId = id;
    } catch (err: unknown) {
      const { summary, detail } = this.formatGoogleClientError(err);
      const logBody = detail ? `${summary} | ${detail}` : summary;
      this.logger.error(`Google Sheets test-auth tạo Sheet thất bại: ${logBody}`);
      const hintSource = `${summary} ${detail ?? ''}`;
      const specific = this.hintsForSheetsCreateFailure(hintSource);
      const generic =
        /permission|403|PERMISSION_DENIED/i.test(hintSource) && !specific
          ? ' Kiểm tra đúng project (project_id trong JSON = project trên console), bật Google Sheets API + Google Drive API, restart server.'
          : '';
      const detailSuffix = detail ? ` Chi tiết: ${detail}` : '';
      throw new BadGatewayException(
        `Không tạo được Sheet test: ${summary}.${detailSuffix}${specific || generic ? ` ${specific || generic}` : ''}`,
      );
    }

    await this.shareSpreadsheetIfConfigured(jwt, spreadsheetId);

    return {
      ok: true,
      credentialSource: resolved.source,
      clientEmail: keys.client_email,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    };
  }

  private async shareSpreadsheetIfConfigured(
    auth: JWT,
    spreadsheetId: string,
  ): Promise<void> {
    const editorEmail = this.configService
      .get<string>('GOOGLE_SHEETS_EDITOR_EMAIL', '')
      ?.trim();
    if (!editorEmail) {
      return;
    }

    const drive = google.drive({ version: 'v3', auth });
    try {
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: {
          type: 'user',
          role: 'writer',
          emailAddress: editorEmail,
        },
        sendNotificationEmail: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `Không thêm quyền chỉnh sửa cho ${editorEmail} (spreadsheetId=${spreadsheetId}): ${msg}`,
      );
    }
  }
}
