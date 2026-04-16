import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GoogleSheetsService } from './google-sheets.service';
import type { GoogleSheetsAuthTestResponse } from './google-sheets.types.js';

@Controller('google-sheets')
export class GoogleSheetsController {
  constructor(private readonly googleSheetsService: GoogleSheetsService) {}

  /**
   * Kiểm tra đọc service account (file hoặc env), token Google, và (mặc định) tạo 1 Sheet test
   * để trả về URL mở trên trình duyệt. `skipCreate=true` chỉ kiểm tra credentials.
   */
  @Get('test-auth')
  @UseGuards(JwtAuthGuard)
  testAuth(
    @Query('skipCreate') skipCreate?: string,
  ): Promise<GoogleSheetsAuthTestResponse> {
    const skip =
      skipCreate === '1' ||
      skipCreate === 'true' ||
      skipCreate === 'yes';
    return this.googleSheetsService.testSheetsAuth({ skipCreate: skip });
  }
}
