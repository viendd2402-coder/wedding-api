import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentInvitationDetailsEntity } from './entities/payment-invitation-details.entity';
import { PaymentEntity, PaymentStatus } from './entities/payment.entity';
import { ACTIVE_PAYMENT_GATEWAY } from './providers/payment-gateway.tokens';
import { S3Service } from '../storage/s3.service';
import { INVITATION_TEMPLATES } from './invitation-templates.catalog';
import { PaymentsService } from './payments.service';
import type { CreatePaymentLinkDto } from './dto/create-payment-link.dto';

describe('PaymentsService', () => {
  let service: PaymentsService;
  const activeGateway = {
    createPaymentLink: jest.fn(),
  };

  beforeEach(async () => {
    activeGateway.createPaymentLink.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: getRepositoryToken(PaymentEntity),
          useValue: {
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PaymentInvitationDetailsEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: ACTIVE_PAYMENT_GATEWAY,
          useValue: activeGateway,
        },
        {
          provide: S3Service,
          useValue: {
            resolvePublicObjectUrl: jest.fn().mockReturnValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('delegates createPaymentLink to active gateway', async () => {
    const paid = INVITATION_TEMPLATES.find((t) => !t.isFree)!;
    const dto = {
      invitation: {
        templateSlug: paid.templateSlug,
        version: 1,
        brideName: 'A',
        groomName: 'B',
        weddingDate: '2026-01-01',
        venue: 'Venue',
      },
    } satisfies CreatePaymentLinkDto;
    const res = {
      paymentId: 1,
      checkoutUrl: 'https://pay.test',
      orderCode: '1',
      status: PaymentStatus.PENDING,
    };
    activeGateway.createPaymentLink.mockResolvedValue(res);

    const out = await service.createPaymentLink(9, dto, '127.0.0.1');

    expect(out).toEqual(res);
    expect(activeGateway.createPaymentLink).toHaveBeenCalledWith(
      9,
      dto,
      '127.0.0.1',
    );
  });
});
