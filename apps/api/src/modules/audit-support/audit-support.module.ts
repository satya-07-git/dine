import { Module } from '@nestjs/common';
import { AuditSupportController } from './audit-support.controller';
import { AuditSupportService } from './audit-support.service';
import { DatabaseModule } from '../../common/db/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AuditSupportController],
  providers: [AuditSupportService],
  exports: [AuditSupportService],
})
export class AuditSupportModule {}
