import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportEntity } from './entities/report.entity';
import { ReportSubmission } from './types/report.types';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(ReportEntity)
    private readonly reportRepository: Repository<ReportEntity>,
  ) {}

  async createReport(dto: CreateReportDto): Promise<ReportSubmission> {
    const report = await this.reportRepository.save(
      this.reportRepository.create({
        fullName: dto.fullName.trim(),
        phone: dto.phone.trim(),
        type: dto.type,
        description: dto.description?.trim() ?? null,
      }),
    );

    return {
      id: report.id,
      fullName: report.fullName,
      phone: report.phone,
      type: report.type,
      description: report.description ?? null,
      createdAt: report.createdAt.toISOString(),
    };
  }
}
