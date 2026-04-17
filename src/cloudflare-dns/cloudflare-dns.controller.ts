import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CloudflareDnsService } from './cloudflare-dns.service';
import { CreateCloudflareDnsRecordDto } from './dto/create-dns-record.dto';
import { ListCloudflareDnsRecordsQueryDto } from './dto/list-dns-records.query.dto';

@Controller('cloudflare/dns-records')
@UseGuards(JwtAuthGuard)
export class CloudflareDnsController {
  constructor(private readonly cloudflareDnsService: CloudflareDnsService) {}

  @Post()
  create(@Body() dto: CreateCloudflareDnsRecordDto) {
    return this.cloudflareDnsService.createDnsRecord(dto);
  }

  @Get()
  list(@Query() query: ListCloudflareDnsRecordsQueryDto) {
    return this.cloudflareDnsService.listDnsRecords(query);
  }

  @Delete(':recordId')
  remove(@Param('recordId') recordId: string) {
    return this.cloudflareDnsService.deleteDnsRecord(recordId);
  }
}
