import {
  SocketRoomType,
  SocketEventType,
  BullQueueName,
  EventRecoveryMode,
  RedisQueueState,
} from '@dine/contracts';

export interface SocketRoomSubscription {
  room: string;
  roomType: SocketRoomType;
  entityId: string;
  audience: 'STAFF' | 'CUSTOMER' | 'PUBLIC_AVAILABILITY';
  userId: string;
  socketId?: string;
  joinedAt: string;
}

export interface SocketClientConnection {
  socketId: string;
  userId?: string;
  userRole?: string;
  restaurantId?: string;
  rooms: Set<string>;
  connectedAt: string;
}

export interface BullJobRecord {
  jobId: string;
  queueName: BullQueueName;
  entityId: string;
  jobType: string;
  version: number;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER';
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  deadLetterReason?: string;
  recoveryOwner?: string;
  scheduledFor: string;
  completedAt?: string;
}

export interface EventRecoveryCursor {
  entityType: 'BOOKING' | 'RESTAURANT' | 'TABLE';
  entityId: string;
  minRetainedSequence: number;
  maxRetainedSequence: number;
  minRetainedVersion: number;
  maxRetainedVersion: number;
  retentionWindowSeconds: number;
  updatedAt: string;
}

export interface ReconnectEvaluationResult {
  mode: EventRecoveryMode;
  resyncRequired: boolean;
  snapshotUrl?: string;
  events: Array<Record<string, unknown>>;
  message: string;
}
