import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UserEntity } from '../auth/entities/user.entity';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module';
import { MailModule } from '../mail/mail.module';
import { PayosModule } from '../payos/payos.module';
import { StorageModule } from '../storage/storage.module';
import { VnpayModule } from '../vnpay/vnpay.module';
import { PaymentInvitationDetailsEntity } from './entities/payment-invitation-details.entity';
import { PaymentEntity } from './entities/payment.entity';
import { getActivePaymentProvider } from './payment-provider';
import { PaymentInvitationPublicController } from './payment-invitation-public.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PayosLegacyPaymentsController } from './providers/payos/payos-legacy.controller';
import { PayosPaymentGatewayService } from './providers/payos/payos-payment-gateway.service';
import { getPaymentGatewayFromRegistry } from './providers/payment-gateway.registry';
import { ACTIVE_PAYMENT_GATEWAY } from './providers/payment-gateway.tokens';
import type { IPaymentGateway } from './providers/payment-gateway.interface';
import { PayosWebhookController } from './providers/payos/payos-webhook.controller';
import { VnpayCallbacksController } from './providers/vnpay/vnpay-callbacks.controller';
import { VnpayPaymentGatewayService } from './providers/vnpay/vnpay-payment-gateway.service';
import { PostPaymentProcessor } from './queues/post-payment.processor';
import { PostPaymentQueueService } from './queues/post-payment-queue.service';
import { POST_PAYMENT_QUEUE_NAME } from './queues/post-payment.queue';
import { PaymentInvitationDetailsService } from './services/payment-invitation-details.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentEntity,
      PaymentInvitationDetailsEntity,
      UserEntity,
    ]),
    BullModule.registerQueue({
      name: POST_PAYMENT_QUEUE_NAME,
    }),
    StorageModule,
    GoogleSheetsModule,
    MailModule,
    PayosModule,
    VnpayModule,
    AuthModule,
  ],
  controllers: [
    PaymentInvitationPublicController,
    PaymentsController,
    PayosLegacyPaymentsController,
    PayosWebhookController,
    VnpayCallbacksController,
  ],
  providers: [
    PayosPaymentGatewayService,
    VnpayPaymentGatewayService,
    {
      provide: ACTIVE_PAYMENT_GATEWAY,
      useFactory: (
        configService: ConfigService,
        payosGateway: PayosPaymentGatewayService,
        vnpayGateway: VnpayPaymentGatewayService,
      ): IPaymentGateway => {
        const id = getActivePaymentProvider(configService);
        return getPaymentGatewayFromRegistry(id, {
          payos: payosGateway,
          vnpay: vnpayGateway,
        });
      },
      inject: [ConfigService, PayosPaymentGatewayService, VnpayPaymentGatewayService],
    },
    PaymentsService,
    PostPaymentQueueService,
    PostPaymentProcessor,
    PaymentInvitationDetailsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
