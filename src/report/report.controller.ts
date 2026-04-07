import { Body, Controller, Post } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportService } from './report.service';
import { ReportSubmission } from './types/report.types';

@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  createReport(@Body() dto: CreateReportDto): Promise<ReportSubmission> {
    return this.reportService.createReport(dto);
  }
}
