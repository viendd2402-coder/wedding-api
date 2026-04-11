import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../auth/decorators/current-user-id.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import { PaymentsService } from './payments.service';
import {
  CreatePaymentLinkResponse,
  PaymentDetailResponse,
  PaymentListResponse,
} from './types/payment.types';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payment-link')
  @UseGuards(JwtAuthGuard)
  createPaymentLink(
    @CurrentUserId() userId: number,
    @Body() dto: CreatePaymentLinkDto,
    @Ip() clientIp: string,
  ): Promise<CreatePaymentLinkResponse> {
    return this.paymentsService.createPaymentLink(userId, dto, clientIp);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  listPayments(
    @CurrentUserId() userId: number,
    @Query('limit') limit?: string,
  ): Promise<PaymentListResponse> {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.paymentsService.listPaymentsByUser(userId, parsedLimit);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getPayment(
    @CurrentUserId() userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PaymentDetailResponse> {
    return this.paymentsService.getPaymentById(id, userId);
  }
}
