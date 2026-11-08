import {
  NotificationChannel,
  NotificationDeliveryStatus,
  OutboxEventStatus,
  RealtimeTopicType,
} from '@dine/contracts';

export interface EventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  sequenceNumber: number;
  occurredAt: string;
  restaurantId?: string | null;
  userId?: string | null;
  payload: T;
}

export interface NotificationDeliveryTarget {
  outboxEventId: string;
  recipientId: string;
  channel: NotificationChannel;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

export interface NotificationDeliveryResult {
  channel: NotificationChannel;
  recipientId: string;
  idempotencyKey: string;
  success: boolean;
  status: NotificationDeliveryStatus;
  deliveredAt?: string;
  error?: string;
  isDuplicate?: boolean;
}

export interface NotificationSender {
  readonly channel: NotificationChannel;
  send(target: NotificationDeliveryTarget): Promise<NotificationDeliveryResult>;
}

export interface OutboxClaimedEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: OutboxEventStatus | string;
  attempts: number;
  maxAttempts: number;
  sequenceNumber: number;
  restaurantId?: string | null;
  userId?: string | null;
  createdAt: Date | string;
}
