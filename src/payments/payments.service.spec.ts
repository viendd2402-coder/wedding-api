import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentEntity, PaymentStatus } from './entities/payment.entity';
import { ACTIVE_PAYMENT_GATEWAY } from './providers/payment-gateway.tokens';
import { PaymentsService } from './payments.service';

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
          provide: ACTIVE_PAYMENT_GATEWAY,
          useValue: activeGateway,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('delegates createPaymentLink to active gateway', async () => {
    const dto = { slug: 'wedding-invite-basic' };
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
