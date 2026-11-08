import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/db/database.module';
import { ObservabilityService } from './observability.service';
import { ObservabilityController } from './observability.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ObservabilityController],
  providers: [ObservabilityService],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
