import { Module } from '@nestjs/common';
import { FutureExtensionsController } from './future-extensions.controller';
import { FutureExtensionsService } from './future-extensions.service';
import { DatabaseModule } from '../../common/db/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [FutureExtensionsController],
  providers: [FutureExtensionsService],
  exports: [FutureExtensionsService],
})
export class FutureExtensionsModule {}
