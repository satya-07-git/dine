import { Module } from '@nestjs/common';
import { BookingStatusController } from './booking-status.controller';
import { BookingStatusService } from './booking-status.service';

@Module({
  controllers: [BookingStatusController],
  providers: [BookingStatusService],
  exports: [BookingStatusService],
})
export class BookingStatusModule {}
