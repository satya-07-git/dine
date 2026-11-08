import { Module } from '@nestjs/common';
import { V2CompatibilityController } from './v2-compatibility.controller';
import { V2CompatibilityService } from './v2-compatibility.service';
import { DatabaseModule } from '../../common/db/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [V2CompatibilityController],
  providers: [V2CompatibilityService],
  exports: [V2CompatibilityService],
})
export class V2CompatibilityModule {}
