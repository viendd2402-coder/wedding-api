import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CloudflareDnsController } from './cloudflare-dns.controller';
import { CloudflareDnsService } from './cloudflare-dns.service';

@Module({
  imports: [AuthModule],
  controllers: [CloudflareDnsController],
  providers: [CloudflareDnsService],
  exports: [CloudflareDnsService],
})
export class CloudflareDnsModule {}
