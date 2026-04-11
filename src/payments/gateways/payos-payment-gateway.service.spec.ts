import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PayosService } from '../../payos/payos.service';
import { PaymentEntity, PaymentStatus } from '../entities/payment.entity';
import { PayosPaymentGatewayService } from './payos-payment-gateway.service';

describe('PayosPaymentGatewayService', () => {
  let service: PayosPaymentGatewayService;
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
        PayosPaymentGatewayService,
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

    service = module.get<PayosPaymentGatewayService>(PayosPaymentGatewayService);
  });

  it('throws when webhook data has no orderCode', async () => {
    payosService.verifyWebhook.mockResolvedValue({ status: 'PAID' });

    await expect(
      service.processPayosWebhook({ data: {}, signature: 'sig' }),
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

    const result = await service.processPayosWebhook({
      data: {},
      signature: 'sig',
    });

    expect(result).toEqual({ received: true });
    expect(paymentRepository.save).not.toHaveBeenCalled();
  });
});
