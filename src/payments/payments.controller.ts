import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../auth/decorators/current-user-id.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import { PayosWebhookDto } from './dto/payos-webhook.dto';
import { PaymentsService } from './payments.service';
import {
  CreatePaymentLinkResponse,
  PaymentDetailResponse,
  PaymentListResponse,
} from './types/payment.types';

@Controller('payos')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payment-link')
  @UseGuards(JwtAuthGuard)
  createPaymentLink(
    @CurrentUserId() userId: number,
    @Body() dto: CreatePaymentLinkDto,
  ): Promise<CreatePaymentLinkResponse> {
    return this.paymentsService.createPaymentLink(userId, dto);
  }

  @Post('webhook')
  webhook(@Body() dto: PayosWebhookDto): Promise<{ received: true }> {
    return this.paymentsService.processWebhook(dto);
  }

  @Get('payments')
  @UseGuards(JwtAuthGuard)
  listPayments(
    @CurrentUserId() userId: number,
    @Query('limit') limit?: string,
  ): Promise<PaymentListResponse> {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.paymentsService.listPaymentsByUser(userId, parsedLimit);
  }

  @Get('payments/:id')
  @UseGuards(JwtAuthGuard)
  getPayment(
    @CurrentUserId() userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PaymentDetailResponse> {
    return this.paymentsService.getPaymentById(id, userId);
  }
}
