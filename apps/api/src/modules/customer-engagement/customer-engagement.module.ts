import { Module } from '@nestjs/common';
import { CustomerEngagementController } from './customer-engagement.controller';
import { CustomerEngagementService } from './customer-engagement.service';
import { DatabaseModule } from '../../common/db/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [CustomerEngagementController],
  providers: [CustomerEngagementService],
  exports: [CustomerEngagementService],
})
export class CustomerEngagementModule {}
