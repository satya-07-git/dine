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
} from 'drizzle-orm/pg-core';

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
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 4. Bookings & Table Allocations
// ============================================================================
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id).notNull(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id).notNull(),
  partySize: integer('party_size').notNull(),
  requestedStart: timestamp('requested_start', { withTimezone: true }).notNull(),
  status: text('status').notNull(),
  policySnapshot: jsonb('policy_snapshot').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tableAllocations = pgTable('table_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'cascade' }).notNull(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
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
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 5. Payment Gateway Tracking
// ============================================================================
export const paymentAttempts = pgTable('payment_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  gateway: varchar('gateway', { length: 50 }).default('RAZORPAY').notNull(),
  gatewayOrderId: varchar('gateway_order_id', { length: 100 }).notNull().unique(),
  amountMinor: integer('amount_minor').notNull(),
  currency: varchar('currency', { length: 3 }).default('INR').notNull(),
  status: text('status').notNull(),
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
  gatewayRefundId: varchar('gateway_refund_id', { length: 100 }),
  amountMinor: integer('amount_minor').notNull(),
  reason: text('reason'),
  status: varchar('status', { length: 50 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 6. Waitlist Queue
// ============================================================================
export const waitlistEntries = pgTable('waitlist_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => profiles.id).notNull(),
  partySize: integer('party_size').notNull(),
  requestedStart: timestamp('requested_start', { withTimezone: true }).notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const waitlistOffers = pgTable('waitlist_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  waitlistEntryId: uuid('waitlist_entry_id').references(() => waitlistEntries.id, { onDelete: 'cascade' }).notNull(),
  allocationId: uuid('allocation_id').references(() => tableAllocations.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id'),
  restaurantId: uuid('restaurant_id'),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  diff: jsonb('diff'),
  requestId: uuid('request_id'),
  ipAddress: inet('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
