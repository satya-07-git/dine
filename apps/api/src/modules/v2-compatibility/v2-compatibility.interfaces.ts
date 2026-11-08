import {
  InventoryClaimState,
  ReservationHoldStatus,
  V2ReservationStatus,
  V2PaymentMode,
  V2PaymentStatus,
} from '@dine/contracts';

export interface V2SourceItem {
  name: string;
  relativePath: string;
  sha256: string;
  type: 'TEXT_SPEC' | 'DIAGRAM';
}

export interface V2RouteItem {
  method: string;
  canonicalRoute: string;
  legacyAlias: string;
  status: 'ACTIVE' | 'DEPRECATED';
  owningEpic: string;
}

export interface V2HoldRecord {
  id: string;
  claimId: string;
  restaurantId: string;
  tableId: string;
  userId: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  effectiveEndsAt: string;
  expiresAt: string;
  serverTime: string;
  status: ReservationHoldStatus;
  paymentMode: V2PaymentMode;
  depositAmountPaise: number;
}

export interface V2ClaimRecord {
  id: string;
  restaurantId: string;
  tableId: string;
  startsAt: string;
  endsAt: string;
  state: InventoryClaimState;
  expiresAt?: string | null;
}

export interface V2ReservationRecord {
  id: string;
  bookingReference: string;
  restaurantId: string;
  tableId: string;
  claimId: string;
  holdId?: string | null;
  userId: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  status: V2ReservationStatus;
  paymentMode: V2PaymentMode;
  depositAmountPaise: number;
  confirmedAt: string;
}

export interface V2IdempotencyRecord {
  actorId: string;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
  responseBody: Record<string, unknown>;
  createdAt: string;
}
