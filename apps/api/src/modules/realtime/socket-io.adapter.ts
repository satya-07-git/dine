import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
  SocketEventType,
} from '@dine/contracts';
import {
  NotificationSender,
  NotificationDeliveryTarget,
  NotificationDeliveryResult,
} from '../notifications/notifications.interfaces';
import { SocketIoGateway } from './socket-io.gateway';

/**
 * Socket.IO Outbox Adapter:
 * Connects outbox worker dispatch to Socket.IO room broadcast.
 * Implements Task T08: Connect outbox dispatch to gateway through an adapter.
 */
@Injectable()
export class SocketIoAdapter implements NotificationSender {
  readonly channel = NotificationChannel.REALTIME_BROADCAST;
  private readonly logger = new Logger(SocketIoAdapter.name);

  constructor(private readonly gateway: SocketIoGateway) {}

  async send(target: NotificationDeliveryTarget): Promise<NotificationDeliveryResult> {
    const raw = target.payload || {};
    const eventType: string = String(raw.event_type || raw.eventType || SocketEventType.BOOKING_CONFIRMED);

    // Resolve target room based on recipient and event type
    let targetRoom: string;
    if (target.recipientId.startsWith('restaurant:')) {
      targetRoom = target.recipientId;
    } else if (target.recipientId.startsWith('booking:')) {
      targetRoom = target.recipientId;
    } else if (raw.restaurant_id || raw.restaurantId) {
      targetRoom = `restaurant:${raw.restaurant_id || raw.restaurantId}`;
    } else if (raw.booking_id || raw.bookingId) {
      targetRoom = `booking:${raw.booking_id || raw.bookingId}`;
    } else {
      targetRoom = `booking:${target.recipientId}`;
    }

    const broadcastResult = this.gateway.broadcastToRoom(
      targetRoom,
      eventType,
      raw
    );

    this.logger.log(
      `[SocketIoAdapter] Dispatched outbox event=${eventType} to room=${targetRoom} recipients=${broadcastResult.deliveredToSockets}`
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
