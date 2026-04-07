import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PayosService } from '../payos/payos.service';
import { PaymentEntity, PaymentStatus } from './entities/payment.entity';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let payosService: {
    verifyWebhook: jest.Mock;
  };

  beforeEach(async () => {
    paymentRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((data: Partial<PaymentEntity>) => data as PaymentEntity),
    };
    payosService = {
      verifyWebhook: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: getRepositoryToken(PaymentEntity),
          useValue: paymentRepository,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: PayosService,
          useValue: payosService,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('throws when webhook data has no orderCode', async () => {
    payosService.verifyWebhook.mockResolvedValue({ status: 'PAID' });

    await expect(
      service.processWebhook({ data: {}, signature: 'sig' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is idempotent when payment already PAID', async () => {
    payosService.verifyWebhook.mockResolvedValue({
      orderCode: '123',
      status: 'PAID',
    });
    paymentRepository.findOne.mockResolvedValue({
      id: 1,
      providerOrderCode: '123',
      status: PaymentStatus.PAID,
    });

    const result = await service.processWebhook({ data: {}, signature: 'sig' });

    expect(result).toEqual({ received: true });
    expect(paymentRepository.save).not.toHaveBeenCalled();
  });
});
