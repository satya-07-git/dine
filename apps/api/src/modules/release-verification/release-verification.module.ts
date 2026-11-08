import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/db/database.module';
import { ReleaseVerificationController } from './release-verification.controller';
import { ReleaseVerificationService } from './release-verification.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ReleaseVerificationController],
  providers: [ReleaseVerificationService],
  exports: [ReleaseVerificationService],
})
export class ReleaseVerificationModule {}
