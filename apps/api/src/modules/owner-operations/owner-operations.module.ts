import { Module } from '@nestjs/common';
import { OwnerOperationsController } from './owner-operations.controller';
import { OwnerOperationsService } from './owner-operations.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { TenantGuard } from '../../common/auth/tenant.guard';

@Module({
  controllers: [OwnerOperationsController],
  providers: [OwnerOperationsService, AuthGuard, TenantGuard],
  exports: [OwnerOperationsService],
})
export class OwnerOperationsModule {}
