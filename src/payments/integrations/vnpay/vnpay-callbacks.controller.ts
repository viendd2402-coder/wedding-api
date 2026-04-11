import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { BypassResponseEnvelope } from '../../../common/decorators/bypass-response-envelope.decorator';
import { VnpayService } from '../../../vnpay/vnpay.service';
import { VnpayPaymentGatewayService } from '../../gateways/vnpay-payment-gateway.service';

@Controller('payments/vnpay')
export class VnpayCallbacksController {
  constructor(
    private readonly vnpayPaymentGateway: VnpayPaymentGatewayService,
  ) {}

  @BypassResponseEnvelope()
  @Get('return')
  async vnpayReturn(@Req() req: Request, @Res() res: Response): Promise<void> {
    const flat = VnpayService.parseVnpQueryFromRequest(req);
    const { redirectUrl } =
      await this.vnpayPaymentGateway.processVnpayBrowserReturn(flat);
    res.redirect(302, redirectUrl);
  }

  @BypassResponseEnvelope()
  @Get('ipn')
  async vnpayIpn(@Req() req: Request, @Res() res: Response): Promise<void> {
    const flat = VnpayService.parseVnpQueryFromRequest(req);
    const body = await this.vnpayPaymentGateway.processVnpayIpn(flat);
    res.status(200).json(body);
  }
}
