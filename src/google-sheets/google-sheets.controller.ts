import { Body, Controller, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppendGuestBookDto } from './dto/append-guest-book.dto';
import { GoogleSheetsService } from './google-sheets.service';
import type {
  GoogleSheetsAppendResponse,
  GoogleSheetsAuthTestResponse,
} from './google-sheets.types.js';

@Controller('google-sheets')
export class GoogleSheetsController {
  constructor(private readonly googleSheetsService: GoogleSheetsService) {}

  /**
   * Tạo một Google Sheet test qua Apps Script webhook.
   * Query: `brideName`, `groomName` (dùng làm tiêu đề file).
   */
  @Post('create-sheet')
  @UseGuards(JwtAuthGuard)
  createSheet(
    @Query('brideName') brideName: string,
    @Query('groomName') groomName: string,
  ): Promise<GoogleSheetsAuthTestResponse> {
    return this.googleSheetsService.createTestSheetViaAppsScript(
      brideName ?? '',
      groomName ?? '',
    );
  }

  /**
   * Append một dòng vào tab RSVP hoặc tab lời chúc (Apps Script `action: append`).
   */
  @Post('guest-book/append')
  @UseGuards(JwtAuthGuard)
  appendGuestBook(
    @Body() dto: AppendGuestBookDto,
  ): Promise<GoogleSheetsAppendResponse> {
    return this.googleSheetsService.appendGuestBookRow(dto);
  }
}
