import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/db/database.module';
import { SocketIoGateway } from './socket-io.gateway';
import { EventRecoveryService } from './event-recovery.service';
import { BullMqQueueService } from './bullmq-queue.service';
import { SocketIoAdapter } from './socket-io.adapter';
import { RealtimeController } from './realtime.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [RealtimeController],
  providers: [
    SocketIoGateway,
    EventRecoveryService,
    BullMqQueueService,
    SocketIoAdapter,
  ],
  exports: [
    SocketIoGateway,
    EventRecoveryService,
    BullMqQueueService,
    SocketIoAdapter,
  ],
})
export class RealtimeModule {}
