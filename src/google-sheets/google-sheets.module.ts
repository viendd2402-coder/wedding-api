import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PaymentInvitationDetailsEntity } from '../payments/entities/payment-invitation-details.entity';
import { GoogleSheetsController } from './google-sheets.controller';
import { GoogleSheetsService } from './google-sheets.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentInvitationDetailsEntity]),
    AuthModule,
  ],
  controllers: [GoogleSheetsController],
  providers: [GoogleSheetsService],
  exports: [GoogleSheetsService],
})
export class GoogleSheetsModule {}
