import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RazorpayGatewayAdapter } from './razorpay-gateway.adapter';
import { AuthGuard } from '../../common/auth/auth.guard';
import { ConfigModule } from '../../common/config/config.module';
import { DatabaseModule } from '../../common/db/database.module';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, RazorpayGatewayAdapter, AuthGuard],
  exports: [PaymentsService, RazorpayGatewayAdapter],
})
export class PaymentsModule {}
