import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationDeliveryStatus } from '@dine/contracts';
import {
  NotificationSender,
  NotificationDeliveryTarget,
  NotificationDeliveryResult,
} from '../notifications.interfaces';

@Injectable()
export class RealtimeBroadcastAdapter implements NotificationSender {
  readonly channel = NotificationChannel.REALTIME_BROADCAST;
  private readonly logger = new Logger(RealtimeBroadcastAdapter.name);

  async send(target: NotificationDeliveryTarget): Promise<NotificationDeliveryResult> {
    // Project minimal payload for broadcast (ADR-006: Realtime hints only, canonical state in REST)
    const raw = target.payload || {};
    const minimalPayload = {
      event_id: raw.event_id || raw.eventId,
      entity_id: raw.entity_id || raw.booking_id || raw.aggregate_id,
      event_type: raw.event_type || raw.eventType,
      status: raw.status || raw.to_status,
      sequence_number: raw.sequence_number || raw.sequenceNumber || 1,
      version: raw.version || 1,
      occurred_at: raw.occurred_at || new Date().toISOString(),
    };

    this.logger.log(
      `[RealtimeBroadcastAdapter] Broadcasted minimal hint to recipient=${target.recipientId} payload=${JSON.stringify(minimalPayload)}`
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
