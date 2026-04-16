import { Controller, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GoogleSheetsService } from './google-sheets.service';
import type { GoogleSheetsAuthTestResponse } from './google-sheets.types.js';

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
}
