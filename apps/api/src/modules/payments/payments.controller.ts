import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhooks/razorpay')
  @ApiOperation({ summary: 'Razorpay webhook inbox endpoint' })
  async handleWebhook(
    @Headers('x-razorpay-signature') signature: string,
    @Body() body: any
  ) {
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }
    return this.paymentsService.processWebhook({
      id: body?.id || 'evt_test',
      event: body?.event || 'payment.captured',
      payload: body,
    });
  }
}
