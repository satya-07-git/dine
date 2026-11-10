import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  time,
  jsonb,
  doublePrecision,
  inet,
  primaryKey,
  customType,
  numeric,
} from 'drizzle-orm/pg-core';

export const tstzrange = customType<{ data: string }>({
  dataType() {
    return 'tstzrange';
  },
});

// ============================================================================
// 1. Identity & Profiles
// ============================================================================
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  authUid: uuid('auth_uid').unique(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 2. Restaurants, Cuisines, Hours & Policies (EPIC-004 & EPIC-005)
// ============================================================================
export const cuisines = pgTable('cuisines', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const restaurants = pgTable('restaurants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  timezone: text('timezone').default('Asia/Kolkata').notNull(),
  policyMode: text('policy_mode').default('FREE_RESERVATION').notNull(),
  depositAmountMinor: integer('deposit_amount_minor').default(0).notNull(),
  depositCurrency: varchar('deposit_currency', { length: 3 }).default('INR').notNull(),
  defaultDurationMin: integer('default_duration_min').default(90).notNull(),
  turnoverBufferMin: integer('turnover_buffer_min').default(15).notNull(),
  policyVersion: integer('policy_version').default(1).notNull(),
  minPartySize: integer('min_party_size').default(1).notNull(),
  maxPartySize: integer('max_party_size').default(20).notNull(),
  leadTimeMinMinutes: integer('lead_time_min_minutes').default(30).notNull(),
  leadTimeMaxDays: integer('lead_time_max_days').default(60).notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  isPublished: boolean('is_published').default(true).notNull(),
  status: text('status').default('PUBLISHED').notNull(),
  priceTier: varchar('price_tier', { length: 5 }).default('$$').notNull(),
  coverImageUrl: text('cover_image_url'),
  mediaGallery: jsonb('media_gallery').default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const restaurantCuisines = pgTable(
  'restaurant_cuisines',
  {
    restaurantId: uuid('restaurant_id')
      .references(() => restaurants.id, { onDelete: 'cascade' }
      ).notNull(),
    cuisineId: uuid('cuisine_id')
      .references(() => cuisines.id, { onDelete: 'cascade' }
      ).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.restaurantId, table.cuisineId] }),
  })
);

export const restaurantMemberships = pgTable('restaurant_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').notNull(), // 'OWNER' | 'MANAGER' | 'HOST'
  status: text('status').default('ACTIVE').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const openingHours = pgTable('opening_hours', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }).notNull(),
  dayOfWeek: integer('day_of_week').notNull(), // 0 - 6 (0 = Sunday, 1 = Monday, etc.)
  openTime: time('open_time').notNull(),
  closeTime: time('close_time').notNull(),
});

export const specialClosures = pgTable('special_closures', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }).notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  reason: text('reason'),
});

export const restaurantPolicyHistory = pgTable('restaurant_policy_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }).notNull(),
  version: integer('version').notNull(),
  policyMode: text('policy_mode').notNull(),
  depositAmountMinor: integer('deposit_amount_minor').notNull(),
  depositCurrency: varchar('deposit_currency', { length: 3 }).default('INR').notNull(),
  defaultDurationMin: integer('default_duration_min').notNull(),
  turnoverBufferMin: integer('turnover_buffer_min').notNull(),
  minPartySize: integer('min_party_size').notNull(),
  maxPartySize: integer('max_party_size').notNull(),
  leadTimeMinMinutes: integer('lead_time_min_minutes').notNull(),
  leadTimeMaxDays: integer('lead_time_max_days').notNull(),
  changedBy: uuid('changed_by').references(() => profiles.id),
  changeReason: text('change_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 2.1 Menu Catalog & Public Media (EPIC-005)
// ============================================================================
export const menuCategories = pgTable('menu_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  displayOrder: integer('display_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const menuItems = pgTable('menu_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }).notNull(),
  categoryId: uuid('category_id').references(() => menuCategories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  priceMinor: integer('price_minor').notNull(),
  currency: varchar('currency', { length: 3 }).default('INR').notNull(),
  isAvailable: boolean('is_available').default(true).notNull(),
  dietaryTags: text('dietary_tags').array().default([]).notNull(),
  imageUrl: text('image_url'),
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const restaurantMedia = pgTable('restaurant_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }).notNull(),
  url: text('url').notNull(),
  caption: text('caption'),
  mediaType: varchar('media_type', { length: 20 }).default('IMAGE').notNull(),
  isFeatured: boolean('is_featured').default(false).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 3. Floor Plans & Tables (EPIC-006)
// ============================================================================
export const floors = pgTable('floors', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  floorNumber: integer('floor_number').default(1).notNull(),
  currentVersion: integer('current_version').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const floorPlanVersions = pgTable('floor_plan_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  floorId: uuid('floor_id').references(() => floors.id, { onDelete: 'cascade' }).notNull(),
  versionNumber: integer('version_number').default(1).notNull(),
  layoutSnapshot: jsonb('layout_snapshot').default({}).notNull(),
  svgLayoutUrl: text('svg_layout_url'),
  createdBy: uuid('created_by').references(() => profiles.id),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const restaurantTables = pgTable('restaurant_tables', {
  id: uuid('id').primaryKey().defaultRandom(),
  floorId: uuid('floor_id').references(() => floors.id, { onDelete: 'cascade' }).notNull(),
  tableNumber: varchar('table_number', { length: 20 }).notNull(),
  capacity: integer('capacity').notNull(),
  minCovers: integer('min_covers').default(1).notNull(),
  zone: varchar('zone', { length: 50 }).default('MAIN').notNull(),
  x: doublePrecision('x').default(0.0).notNull(),
  y: doublePrecision('y').default(0.0).notNull(),
  w: doublePrecision('w').default(1.0).notNull(),
  h: doublePrecision('h').default(1.0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tableBlocks = pgTable('table_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'cascade' }).notNull(),
  blockPeriod: tstzrange('block_period').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 4. Bookings, Check-in Tokens & Table Allocations (EPIC-009 & EPIC-014)
// ============================================================================
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id).notNull(),
  partySize: integer('party_size').notNull(),
  requestedStart: timestamp('requested_start', { withTimezone: true }).notNull(),
  diningPeriod: tstzrange('dining_period'),
  status: text('status').notNull(),
  version: integer('version').default(1).notNull(),
  policySnapshot: jsonb('policy_snapshot').default({}).notNull(),
  isWalkIn: boolean('is_walk_in').default(false).notNull(),
  guestName: text('guest_name'),
  guestPhone: text('guest_phone'),
  guestEmail: text('guest_email'),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  seatedAt: timestamp('seated_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  noShowAt: timestamp('no_show_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const bookingCheckInTokens = pgTable('booking_check_in_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  isUsed: boolean('is_used').default(false).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tableAllocations = pgTable('table_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'cascade' }).notNull(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  diningPeriod: tstzrange('dining_period').notNull(),
  status: text('status').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const bookingStatusEvents = pgTable('booking_status_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  actorId: uuid('actor_id'),
  actorRole: text('actor_role'),
  reason: text('reason'),
  sequenceNumber: integer('sequence_number').default(1).notNull(),
  requestId: uuid('request_id'),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 5. Payment Gateway Tracking & Reconciliation (EPIC-010 & EPIC-011)
// ============================================================================
export const paymentAttempts = pgTable('payment_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  gateway: varchar('gateway', { length: 50 }).default('RAZORPAY').notNull(),
  gatewayOrderId: varchar('gateway_order_id', { length: 100 }).notNull().unique(),
  gatewayPaymentId: varchar('gateway_payment_id', { length: 100 }),
  amountMinor: integer('amount_minor').notNull(),
  currency: varchar('currency', { length: 3 }).default('INR').notNull(),
  status: text('status').notNull(),
  reconciliationStatus: text('reconciliation_status').default('NONE').notNull(),
  reviewStartedAt: timestamp('review_started_at', { withTimezone: true }),
  reviewExpiresAt: timestamp('review_expires_at', { withTimezone: true }),
  reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
  lastReconciledAt: timestamp('last_reconciled_at', { withTimezone: true }),
  retryCount: integer('retry_count').default(0).notNull(),
  escalationReason: text('escalation_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const paymentEvents = pgTable('payment_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  gatewayEventId: varchar('gateway_event_id', { length: 100 }).notNull().unique(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentAttemptId: uuid('payment_attempt_id').references(() => paymentAttempts.id, { onDelete: 'cascade' }).notNull(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }),
  gatewayRefundId: varchar('gateway_refund_id', { length: 100 }),
  amountMinor: integer('amount_minor').notNull(),
  currency: varchar('currency', { length: 3 }).default('INR').notNull(),
  reason: text('reason'),
  status: varchar('status', { length: 50 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 100 }).unique(),
  metadata: jsonb('metadata').default({}).notNull(),
  initiatedBy: uuid('initiated_by').references(() => profiles.id),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  escalationReason: text('escalation_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const paymentIncidents = pgTable('payment_incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  paymentAttemptId: uuid('payment_attempt_id').references(() => paymentAttempts.id, { onDelete: 'set null' }),
  refundId: uuid('refund_id').references(() => refunds.id, { onDelete: 'set null' }),
  incidentType: text('incident_type').notNull(),
  severity: text('severity').default('HIGH').notNull(),
  status: text('status').default('OPEN').notNull(),
  reason: text('reason').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => profiles.id),
});

// ============================================================================
// 6. Waitlist Queue & Priority Offers (EPIC-012)
// ============================================================================
export const waitlistEntries = pgTable('waitlist_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => profiles.id).notNull(),
  tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'set null' }),
  partySize: integer('party_size').notNull(),
  requestedStart: timestamp('requested_start', { withTimezone: true }).notNull(),
  requestedEnd: timestamp('requested_end', { withTimezone: true }),
  priorityScore: integer('priority_score').default(0).notNull(),
  status: text('status').notNull(),
  skipReason: text('skip_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const waitlistOffers = pgTable('waitlist_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  waitlistEntryId: uuid('waitlist_entry_id').references(() => waitlistEntries.id, { onDelete: 'cascade' }).notNull(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
  tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'set null' }),
  allocationId: uuid('allocation_id').references(() => tableAllocations.id),
  offeredStart: timestamp('offered_start', { withTimezone: true }),
  offeredEnd: timestamp('offered_end', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  status: text('status').notNull(),
  version: integer('version').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const waitlistSkipLogs = pgTable('waitlist_skip_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  waitlistEntryId: uuid('waitlist_entry_id').references(() => waitlistEntries.id, { onDelete: 'cascade' }).notNull(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }).notNull(),
  tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'cascade' }).notNull(),
  skipReason: text('skip_reason').notNull(),
  details: jsonb('details').default({}).notNull(),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 7. Cross-Cutting
// ============================================================================
export const idempotencyRecords = pgTable('idempotency_records', {
  scopeKey: varchar('scope_key', { length: 64 }).primaryKey(),
  userId: uuid('user_id').notNull(),
  endpoint: varchar('endpoint', { length: 200 }).notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  statusCode: integer('status_code').notNull(),
  responseBody: jsonb('response_body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  aggregateType: varchar('aggregate_type', { length: 50 }).notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').default('PENDING').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(5).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  claimedBy: varchar('claimed_by', { length: 100 }),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  lastError: text('last_error'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  sequenceNumber: integer('sequence_number').default(1).notNull(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id),
  userId: uuid('user_id').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  outboxEventId: uuid('outbox_event_id').notNull().references(() => outboxEvents.id),
  recipientId: uuid('recipient_id').notNull(),
  channel: varchar('channel', { length: 50 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 255 }),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(),
  attempts: integer('attempts').default(1).notNull(),
  payload: jsonb('payload').default({}).notNull(),
  lastError: text('last_error'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const realtimeTopicAuthorizations = pgTable('realtime_topic_authorizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  topic: varchar('topic', { length: 255 }).notNull(),
  topicType: varchar('topic_type', { length: 50 }).notNull(),
  userId: uuid('user_id').notNull().references(() => profiles.id),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id'),
  actorRole: varchar('actor_role', { length: 50 }).default('USER'),
  restaurantId: uuid('restaurant_id'),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  diff: jsonb('diff'),
  reason: text('reason'),
  requestId: uuid('request_id'),
  ipAddress: inet('ip_address'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const supportInterventions = pgTable('support_interventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: varchar('ticket_id', { length: 100 }),
  actorId: uuid('actor_id').notNull(),
  actorRole: varchar('actor_role', { length: 50 }).default('SUPPORT').notNull(),
  restaurantId: uuid('restaurant_id'),
  bookingId: uuid('booking_id'),
  interventionType: varchar('intervention_type', { length: 50 }).notNull(),
  reason: text('reason').notNull(),
  priorState: jsonb('prior_state').notNull(),
  newState: jsonb('new_state').notNull(),
  requestId: uuid('request_id'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const privacyErasureRequests = pgTable('privacy_erasure_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  hasFinancialRecords: boolean('has_financial_records').default(false).notNull(),
  retainedRecordsSummary: jsonb('retained_records_summary').default({}),
  anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 12. EPIC-018 Background Jobs, Observability and Recovery
// ============================================================================

export const backgroundJobs = pgTable('background_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobType: varchar('job_type', { length: 100 }).notNull(),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(),
  payload: jsonb('payload').default({}).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(5).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  claimedBy: varchar('claimed_by', { length: 100 }),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  lastError: text('last_error'),
  deadLetterReason: text('dead_letter_reason'),
  executionDurationMs: integer('execution_duration_ms'),
  resultSummary: jsonb('result_summary').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const workerHeartbeats = pgTable('worker_heartbeats', {
  workerId: varchar('worker_id', { length: 100 }).primaryKey(),
  workerName: varchar('worker_name', { length: 100 }).notNull(),
  hostname: varchar('hostname', { length: 100 }).notNull(),
  status: varchar('status', { length: 50 }).default('ACTIVE').notNull(),
  currentJobId: uuid('current_job_id').references(() => backgroundJobs.id),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  metrics: jsonb('metrics').default({ processed_count: 0, error_count: 0, uptime_seconds: 0 }).notNull(),
});

export const systemMetrics = pgTable('system_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  metricName: varchar('metric_name', { length: 100 }).notNull(),
  metricValue: numeric('metric_value', { precision: 12, scale: 4 }).notNull(),
  labels: jsonb('labels').default({}).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 13. EPIC-019 Backend Verification, Staging & Release Gates
// ============================================================================

export const stagingVerificationRuns = pgTable('staging_verification_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  runTag: varchar('run_tag', { length: 100 }).notNull(),
  environment: varchar('environment', { length: 50 }).default('staging').notNull(),
  suiteName: varchar('suite_name', { length: 100 }).notNull(),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(),
  totalChecks: integer('total_checks').default(0).notNull(),
  passedChecks: integer('passed_checks').default(0).notNull(),
  failedChecks: integer('failed_checks').default(0).notNull(),
  evidence: jsonb('evidence').default({}).notNull(),
  executedBy: varchar('executed_by', { length: 100 }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const releaseGateEvaluations = pgTable('release_gate_evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  gateId: varchar('gate_id', { length: 50 }).notNull(),
  gateName: varchar('gate_name', { length: 200 }).notNull(),
  owningEpic: varchar('owning_epic', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).default('PASSED').notNull(),
  decision: varchar('decision', { length: 50 }).default('GO').notNull(),
  blockingReason: text('blocking_reason'),
  evidenceSummary: jsonb('evidence_summary').default({}).notNull(),
  accountableOwner: varchar('accountable_owner', { length: 100 }).notNull(),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 14. EPIC-024 Socket.IO, BullMQ and Database Event Recovery
// ============================================================================

export const reservationEvents = pgTable('reservation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').notNull(),
  restaurantId: uuid('restaurant_id').notNull(),
  version: integer('version').default(1).notNull(),
  sequenceNumber: integer('sequence_number').default(1).notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  fromState: varchar('from_state', { length: 50 }),
  toState: varchar('to_state', { length: 50 }),
  actorId: uuid('actor_id'),
  actorRole: varchar('actor_role', { length: 50 }).default('CUSTOMER').notNull(),
  payload: jsonb('payload').default({}).notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const eventRecoveryCursors = pgTable('event_recovery_cursors', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  minRetainedSequence: integer('min_retained_sequence').default(1).notNull(),
  maxRetainedSequence: integer('max_retained_sequence').default(1).notNull(),
  minRetainedVersion: integer('min_retained_version').default(1).notNull(),
  maxRetainedVersion: integer('max_retained_version').default(1).notNull(),
  retentionWindowSeconds: integer('retention_window_seconds').default(86400).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const bullmqQueueJobs = pgTable('bullmq_queue_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  queueName: varchar('queue_name', { length: 100 }).notNull(),
  jobId: varchar('job_id', { length: 255 }).notNull().unique(),
  entityId: uuid('entity_id').notNull(),
  jobType: varchar('job_type', { length: 100 }).notNull(),
  version: integer('version').default(1).notNull(),
  payload: jsonb('payload').default({}).notNull(),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(5).notNull(),
  lastError: text('last_error'),
  deadLetterReason: text('dead_letter_reason'),
  recoveryOwner: varchar('recovery_owner', { length: 100 }).default('PLATFORM_OPERATIONS'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
