import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationDeliveryStatus } from '@dine/contracts';
import {
  NotificationSender,
  NotificationDeliveryTarget,
  NotificationDeliveryResult,
} from '../notifications.interfaces';

@Injectable()
export class PushNotificationAdapter implements NotificationSender {
  readonly channel = NotificationChannel.PUSH;
  private readonly logger = new Logger(PushNotificationAdapter.name);

  // Configurable simulator state for testing provider outage and retry backoff
  private isOutageSimulated: boolean = false;
  private failNextAttempts: number = 0;

  setOutageSimulation(active: boolean) {
    this.isOutageSimulated = active;
  }

  setFailNextAttempts(count: number) {
    this.failNextAttempts = count;
  }

  async send(target: NotificationDeliveryTarget): Promise<NotificationDeliveryResult> {
    if (this.isOutageSimulated) {
      this.logger.warn(`[PushAdapter] Simulated provider outage active: delivery failed to ${target.recipientId}`);
      return {
        channel: this.channel,
        recipientId: target.recipientId,
        idempotencyKey: target.idempotencyKey,
        success: false,
        status: NotificationDeliveryStatus.FAILED,
        error: 'PUSH_GATEWAY_OUTAGE: Third-party push provider is currently unreachable',
      };
    }

    if (this.failNextAttempts > 0) {
      this.failNextAttempts--;
      this.logger.warn(`[PushAdapter] Simulated transient failure (${this.failNextAttempts} remaining) to ${target.recipientId}`);
      return {
        channel: this.channel,
        recipientId: target.recipientId,
        idempotencyKey: target.idempotencyKey,
        success: false,
        status: NotificationDeliveryStatus.FAILED,
        error: 'PUSH_GATEWAY_TIMEOUT: APNs/FCM transient gateway timeout',
      };
    }

    this.logger.log(`[PushAdapter] Successfully delivered push notification to recipient=${target.recipientId}`);
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
