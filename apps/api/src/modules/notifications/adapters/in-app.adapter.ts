import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationDeliveryStatus } from '@dine/contracts';
import {
  NotificationSender,
  NotificationDeliveryTarget,
  NotificationDeliveryResult,
} from '../notifications.interfaces';

@Injectable()
export class InAppNotificationAdapter implements NotificationSender {
  readonly channel = NotificationChannel.IN_APP;
  private readonly logger = new Logger(InAppNotificationAdapter.name);

  async send(target: NotificationDeliveryTarget): Promise<NotificationDeliveryResult> {
    this.logger.log(
      `[InAppAdapter] Delivered in-app notification to recipient=${target.recipientId} key=${target.idempotencyKey}`
    );
    return {
      channel: this.channel,
      recipientId: target.recipientId,
      idempotencyKey: target.idempotencyKey,
      success: true,
      status: NotificationDeliveryStatus.DELIVERED,
      deliveredAt: new Date().toISOString(),
    };
  }
}
