import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { UserEntity } from '../../auth/entities/user.entity';
import {
  GUEST_BOOK_RSVP_TAB_TITLE,
  GUEST_BOOK_WISHES_TAB_TITLE,
} from '../../google-sheets/guest-book-sheet.constants';
import { GoogleSheetsService } from '../../google-sheets/google-sheets.service';
import { MailService } from '../../mail/mail.service';
import { PaymentInvitationDetailsEntity } from '../entities/payment-invitation-details.entity';
import {
  POST_PAYMENT_JOB_PROVISION_INVITATION_RESOURCES,
  POST_PAYMENT_QUEUE_NAME,
  ProvisionInvitationResourcesJobData,
} from './post-payment.queue';

@Processor(POST_PAYMENT_QUEUE_NAME)
export class PostPaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PostPaymentProcessor.name);

  constructor(
    @InjectRepository(PaymentInvitationDetailsEntity)
    private readonly invitationDetailsRepository: Repository<PaymentInvitationDetailsEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly configService: ConfigService,
    private readonly googleSheetsService: GoogleSheetsService,
    private readonly mailService: MailService,
  ) {
    super();
  }

  async process(job: Job<ProvisionInvitationResourcesJobData>): Promise<void> {
    switch (job.name) {
      case POST_PAYMENT_JOB_PROVISION_INVITATION_RESOURCES:
        await this.handleProvisionInvitationResources(job);
        return;
      default:
        this.logger.warn(`Unsupported post-payment job: ${job.name}`);
    }
  }

  private async handleProvisionInvitationResources(
    job: Job<ProvisionInvitationResourcesJobData>,
  ): Promise<void> {
    const invitationDetailsId = Number(job.data.invitationDetailsId);
    if (!Number.isFinite(invitationDetailsId) || invitationDetailsId <= 0) {
      this.logger.warn(
        `Invalid invitationDetailsId in job ${String(job.id)}: ${String(job.data.invitationDetailsId)}`,
      );
      return;
    }

    const details = await this.invitationDetailsRepository.findOne({
      where: { id: invitationDetailsId },
      relations: { payment: true },
    });
    if (!details) {
      this.logger.warn(
        `Invitation details not found for post-payment job: invitationDetailsId=${invitationDetailsId}`,
      );
      return;
    }

    const sheet = await this.googleSheetsService.ensureGuestBookSpreadsheetByInvitationDetailsId(
      details.id,
    );
    if (!sheet) {
      this.logger.warn(
        `Skip thank-you email because guest book sheet is unavailable for invitationDetailsId=${details.id}`,
      );
      return;
    }

    const userId = details.payment?.userId;
    if (!userId) {
      this.logger.warn(
        `Skip thank-you email because payment userId is missing for invitationDetailsId=${details.id}`,
      );
      return;
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    const userEmail = user?.email?.trim();
    if (!userEmail) {
      this.logger.warn(
        `Skip thank-you email because user email is missing for userId=${userId}`,
      );
      return;
    }

    const frontendBase = this.configService
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .trim()
      .replace(/\/$/, '');
    const invitationUrl = `${frontendBase}/invite/${encodeURIComponent(details.code)}`;
    const rsvpTrackingUrl = this.buildSheetTabUrl(
      sheet.spreadsheetUrl,
      GUEST_BOOK_RSVP_TAB_TITLE,
    );
    const wishTrackingUrl = this.buildSheetTabUrl(
      sheet.spreadsheetUrl,
      GUEST_BOOK_WISHES_TAB_TITLE,
    );

    await this.mailService.sendPostPaymentThankYouEmailNow({
      to: userEmail,
      invitationCode: details.code,
      brideName: details.brideName,
      groomName: details.groomName,
      invitationUrl,
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl,
      rsvpTrackingUrl,
      wishTrackingUrl,
    });
  }

  private buildSheetTabUrl(spreadsheetUrl: string, tabTitle: string): string {
    const base = spreadsheetUrl.split('#')[0];
    return `${base}#range=${encodeURIComponent(`'${tabTitle}'!A1`)}`;
  }
}
