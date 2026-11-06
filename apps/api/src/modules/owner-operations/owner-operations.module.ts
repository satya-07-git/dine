import { Module } from '@nestjs/common';
import { OwnerOperationsController } from './owner-operations.controller';
import { OwnerOperationsService } from './owner-operations.service';

@Module({
  controllers: [OwnerOperationsController],
  providers: [OwnerOperationsService],
  exports: [OwnerOperationsService],
})
export class OwnerOperationsModule {}
