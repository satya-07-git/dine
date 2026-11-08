import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { InAppNotificationAdapter } from './adapters/in-app.adapter';
import { PushNotificationAdapter } from './adapters/push.adapter';
import { RealtimeBroadcastAdapter } from './adapters/realtime-broadcast.adapter';
import { DatabaseModule } from '../../common/db/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    InAppNotificationAdapter,
    PushNotificationAdapter,
    RealtimeBroadcastAdapter,
  ],
  exports: [
    NotificationsService,
    InAppNotificationAdapter,
    PushNotificationAdapter,
    RealtimeBroadcastAdapter,
  ],
})
export class NotificationsModule {}
