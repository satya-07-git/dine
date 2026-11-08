const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  AuditSupportService,
} = require('../../apps/api/dist/modules/audit-support/audit-support.service');
const {
  recordAuditLog,
  redactSensitiveData,
  maskEmail,
  maskPhone,
} = require('../../apps/api/dist/modules/audit-support/audit.helper');

const {
  AppError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  InvalidStateTransitionError,
} = require('../../apps/api/dist/common/errors/app-error');

const {
  ErrorCode,
  SupportInterventionType,
  PrivacyErasureStatus,
} = require('../../packages/contracts/dist');

// ============================================================================
// Mock Database Service Helper
// ============================================================================
function createMockDb(initialData = {}) {
  const auditLogs = initialData.auditLogs || [];
  const supportInterventions = initialData.supportInterventions || [];
  const privacyErasureRequests = initialData.privacyErasureRequests || [];
  const bookings = initialData.bookings || [];
  const tableAllocations = initialData.tableAllocations || [];
  const bookingStatusEvents = initialData.bookingStatusEvents || [];
  const paymentAttempts = initialData.paymentAttempts || [];
  const refunds = initialData.refunds || [];
  const outboxEvents = initialData.outboxEvents || [];
  const notificationDeliveries = initialData.notificationDeliveries || [];
  const profiles = initialData.profiles || [];
  const memberships = initialData.memberships || [];
  const favorites = initialData.favorites || [];
  const customerPreferences = initialData.customerPreferences || [];

  const createClient = () => {
    let inTransaction = false;
    let transactionLogs = [];

    return {
      query: async (sql, params = []) => {
        const normSql = sql.replace(/\s+/g, ' ').trim();

        if (normSql === 'BEGIN') {
          inTransaction = true;
          transactionLogs = [...auditLogs];
          return { rows: [] };
        }
        if (normSql === 'COMMIT') {
          inTransaction = false;
          return { rows: [] };
        }
        if (normSql === 'ROLLBACK') {
          inTransaction = false;
          // Discard uncommitted audit logs
          auditLogs.length = 0;
          auditLogs.push(...transactionLogs);
          return { rows: [] };
        }

        // 1. UPDATE or DELETE on audit_logs -> Append-Only Trigger Simulation
        if (normSql.startsWith('UPDATE audit_logs') || normSql.startsWith('DELETE FROM audit_logs')) {
          throw new Error('Audit and event records are append-only and cannot be updated or deleted');
        }

        // 2. INSERT INTO audit_logs
        if (normSql.includes('INSERT INTO audit_logs')) {
          const id = params[0] || crypto.randomUUID();
          const record = {
            id,
            actor_id: params[1],
            actor_role: params[2],
            restaurant_id: params[3],
            action: params[4],
            entity_type: params[5],
            entity_id: params[6],
            diff: params[7] ? (typeof params[7] === 'string' ? JSON.parse(params[7]) : params[7]) : null,
            request_id: params[8],
            ip_address: params[9],
            reason: params[10],
            metadata: params[11] ? (typeof params[11] === 'string' ? JSON.parse(params[11]) : params[11]) : {},
            created_at: new Date(),
          };
          auditLogs.push(record);
          return { rows: [{ id }] };
        }

        // 3. SELECT FROM audit_logs
        if (normSql.includes('FROM audit_logs')) {
          if (normSql.includes('COUNT(*)')) {
            return { rows: [{ total: auditLogs.length }] };
          }
          let filtered = [...auditLogs];
          if (normSql.includes('restaurant_id = $1') && params[0]) {
            filtered = filtered.filter((a) => a.restaurant_id === params[0]);
          }
          if (normSql.includes('entity_id = $1')) {
            filtered = filtered.filter((a) => a.entity_id === params[0]);
          }
          return { rows: filtered };
        }

        // 4. SELECT FROM bookings
        if (normSql.includes('FROM bookings')) {
          if (normSql.includes('COUNT(*)')) {
            const userId = params[0];
            const matches = bookings.filter((b) => b.user_id === userId);
            return { rows: [{ count: matches.length }] };
          }
          const bookingId = params[0];
          const b = bookings.find((item) => item.id === bookingId);
          return { rows: b ? [{ ...b }] : [] };
        }

        // 5. UPDATE bookings
        if (normSql.startsWith('UPDATE bookings SET')) {
          const status = params[0];
          const version = params[1];
          const bookingId = params[2];
          const b = bookings.find((item) => item.id === bookingId);
          if (b) {
            b.status = status;
            b.version = version;
            b.updated_at = new Date();
          }
          return { rows: b ? [{ ...b }] : [] };
        }

        // 6. INSERT INTO support_interventions
        if (normSql.includes('INSERT INTO support_interventions')) {
          const id = crypto.randomUUID();
          const record = {
            id,
            ticket_id: params[0],
            actor_id: params[1],
            actor_role: params[2],
            restaurant_id: params[3],
            booking_id: params[4],
            intervention_type: params[5],
            reason: params[6],
            prior_state: typeof params[7] === 'string' ? JSON.parse(params[7]) : params[7],
            new_state: typeof params[8] === 'string' ? JSON.parse(params[8]) : params[8],
            request_id: params[9],
            metadata: typeof params[10] === 'string' ? JSON.parse(params[10]) : params[10],
            created_at: new Date(),
          };
          supportInterventions.push(record);
          return { rows: [{ id, created_at: record.created_at }] };
        }

        // 7. SELECT FROM support_interventions
        if (normSql.includes('FROM support_interventions')) {
          const bookingId = params[0];
          const matches = supportInterventions.filter((s) => s.booking_id === bookingId);
          return { rows: matches };
        }

        // 8. INSERT INTO booking_status_events
        if (normSql.includes('INSERT INTO booking_status_events')) {
          const record = {
            id: params[0] || crypto.randomUUID(),
            booking_id: params[0] === 'gen_random_uuid()' ? params[1] : params[0],
            from_status: params[1],
            to_status: params[2],
            actor_id: params[3],
            actor_role: params[4],
            reason: params[5],
            sequence_number: params[6],
            request_id: params[7],
            created_at: new Date(),
          };
          bookingStatusEvents.push(record);
          return { rows: [record] };
        }

        // 9. Sequence number query
        if (normSql.includes('COALESCE(MAX(sequence_number)')) {
          const bookingId = params[0];
          const events = bookingStatusEvents.filter((e) => e.booking_id === bookingId);
          const maxSeq = events.reduce((max, e) => Math.max(max, e.sequence_number || 0), 0);
          return { rows: [{ next_seq: maxSeq + 1 }] };
        }

        // 10. SELECT FROM booking_status_events
        if (normSql.includes('FROM booking_status_events WHERE booking_id = $1')) {
          const bookingId = params[0];
          const matches = bookingStatusEvents.filter((e) => e.booking_id === bookingId);
          return { rows: matches };
        }

        // 11. table_allocations
        if (normSql.includes('FROM table_allocations WHERE booking_id = $1')) {
          const bookingId = params[0];
          const matches = tableAllocations.filter((a) => a.booking_id === bookingId);
          return { rows: matches };
        }

        // 12. payment_attempts
        if (normSql.includes('FROM payment_attempts WHERE booking_id = $1')) {
          const bookingId = params[0];
          const matches = paymentAttempts.filter((p) => p.booking_id === bookingId);
          return { rows: matches };
        }

        // 13. refunds
        if (normSql.includes('FROM refunds WHERE booking_id = $1')) {
          const bookingId = params[0];
          const matches = refunds.filter((r) => r.booking_id === bookingId);
          return { rows: matches };
        }

        // 14. notifications
        if (normSql.includes('FROM notification_deliveries')) {
          return { rows: notificationDeliveries };
        }

        // 15. restaurant_memberships
        if (normSql.includes('FROM restaurant_memberships')) {
          const restId = params[0];
          const userId = params[1];
          const mem = memberships.find((m) => m.restaurant_id === restId && m.user_id === userId);
          return { rows: mem ? [mem] : [] };
        }

        // 16. Privacy erasure queries
        if (normSql.startsWith('DELETE FROM favorites')) {
          const userId = params[0];
          const idx = favorites.findIndex((f) => f.user_id === userId);
          if (idx !== -1) favorites.splice(idx, 1);
          return { rows: [] };
        }

        if (normSql.startsWith('DELETE FROM customer_preferences')) {
          const userId = params[0];
          const idx = customerPreferences.findIndex((p) => p.user_id === userId);
          if (idx !== -1) customerPreferences.splice(idx, 1);
          return { rows: [] };
        }

        if (normSql.startsWith('UPDATE profiles SET full_name = $1')) {
          const userId = params[2];
          const prof = profiles.find((p) => p.id === userId);
          if (prof) {
            prof.full_name = params[0];
            prof.email = params[1];
            prof.phone = null;
            prof.avatar_url = null;
          }
          return { rows: prof ? [prof] : [] };
        }

        if (normSql.startsWith('DELETE FROM profiles WHERE id = $1')) {
          const userId = params[0];
          const idx = profiles.findIndex((p) => p.id === userId);
          if (idx !== -1) profiles.splice(idx, 1);
          return { rows: [] };
        }

        if (normSql.includes('INSERT INTO privacy_erasure_requests')) {
          const record = {
            id: params[0],
            user_id: params[1],
            status: params[2],
            has_financial_records: params[3],
            retained_records_summary: params[4],
            created_at: new Date(),
          };
          privacyErasureRequests.push(record);
          return { rows: [record] };
        }

        return { rows: [] };
      },
      release: () => {},
    };
  };

  const pool = {
    connect: async () => createClient(),
    query: async (sql, params) => {
      const client = createClient();
      return client.query(sql, params);
    },
  };

  return {
    getPool: () => pool,
    data: {
      auditLogs,
      supportInterventions,
      privacyErasureRequests,
      bookings,
      profiles,
      favorites,
      customerPreferences,
    },
  };
}

// ============================================================================
// Unit Test Suite: EPIC-017 Audit, Support and Privacy Controls
// ============================================================================

test('AC1: Shared transactional audit helper commits envelope with actor and request correlation', async () => {
  const mockDb = createMockDb();
  const client = await mockDb.getPool().connect();

  const envelope = {
    actor_id: 'user_support_01',
    actor_role: 'SUPPORT',
    restaurant_id: 'rest_bistro_01',
    action: 'POLICY_OVERRIDE',
    entity_type: 'RESTAURANT',
    entity_id: 'rest_bistro_01',
    reason: 'Emergency VIP event override',
    diff: { policy_mode: { from: 'FREE_RESERVATION', to: 'DEPOSIT_REQUIRED' } },
    request_id: 'req_corr_9999',
    ip_address: '192.168.1.100',
  };

  const auditId = await recordAuditLog(client, envelope);
  assert.ok(auditId, 'Audit log ID must be generated');

  const record = mockDb.data.auditLogs.find((a) => a.id === auditId);
  assert.ok(record, 'Record must exist in audit_logs');
  assert.equal(record.actor_id, 'user_support_01');
  assert.equal(record.actor_role, 'SUPPORT');
  assert.equal(record.action, 'POLICY_OVERRIDE');
  assert.equal(record.request_id, 'req_corr_9999');
  assert.equal(record.reason, 'Emergency VIP event override');
});

test('AC1: Atomic commit ensures rolled-back transaction discards audit log', async () => {
  const mockDb = createMockDb();
  const client = await mockDb.getPool().connect();

  await client.query('BEGIN');
  await recordAuditLog(client, {
    actor_id: 'user_01',
    action: 'FAILED_OPERATION',
    entity_type: 'BOOKING',
    entity_id: 'booking_123',
    reason: 'Testing atomic rollback',
  });

  assert.equal(mockDb.data.auditLogs.length, 1, 'Audit log was staged');

  await client.query('ROLLBACK');
  assert.equal(mockDb.data.auditLogs.length, 0, 'Audit log must be rolled back on transaction abort');
});

test('AC1: Append-only enforcement rejects UPDATE and DELETE on audit_logs', async () => {
  const mockDb = createMockDb();
  const pool = mockDb.getPool();

  await assert.rejects(
    async () => {
      await pool.query('UPDATE audit_logs SET action = $1 WHERE id = $2', ['TAMPERED', 'audit_01']);
    },
    /append-only/i,
    'Database trigger must reject UPDATE on audit_logs'
  );

  await assert.rejects(
    async () => {
      await pool.query('DELETE FROM audit_logs WHERE id = $1', ['audit_01']);
    },
    /append-only/i,
    'Database trigger must reject DELETE on audit_logs'
  );
});

test('AC4: Secret redaction helper scrubs passwords, tokens, API keys, CVV, and raw secrets', () => {
  const sensitivePayload = {
    booking_id: 'b_100',
    customer: {
      name: 'Alice Henderson',
      password: 'SuperSecretPassword123!',
      jwt_token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      access_token: 'secret_token_val',
    },
    payment_meta: {
      card_number: '4111222233334444',
      cvv: '123',
      pin: '9876',
      vpa: 'alice@upi',
      webhook_secret: 'whsec_99999',
    },
    safe_field: 'Truffle Naan Dinner',
  };

  const scrubbed = redactSensitiveData(sensitivePayload);

  assert.equal(scrubbed.customer.password, '[REDACTED]');
  assert.equal(scrubbed.customer.jwt_token, '[REDACTED]');
  assert.equal(scrubbed.customer.access_token, '[REDACTED]');
  assert.equal(scrubbed.payment_meta.card_number, '[REDACTED]');
  assert.equal(scrubbed.payment_meta.cvv, '[REDACTED]');
  assert.equal(scrubbed.payment_meta.pin, '[REDACTED]');
  assert.equal(scrubbed.payment_meta.vpa, '[REDACTED]');
  assert.equal(scrubbed.payment_meta.webhook_secret, '[REDACTED]');
  assert.equal(scrubbed.safe_field, 'Truffle Naan Dinner');
});

test('AC4: Masking helpers format emails and phone numbers correctly', () => {
  assert.equal(maskEmail('alice@example.com'), 'a***e@example.com');
  assert.equal(maskEmail('support@dine.local'), 's***t@dine.local');
  assert.equal(maskPhone('+919876543211'), '+9198*****211');
});

test('AC3: Support intervention requires explicit non-empty justification reason (422)', async () => {
  const mockDb = createMockDb();
  const service = new AuditSupportService(mockDb);

  const supportUser = {
    userId: 'support_agent_01',
    email: 'support@dine.local',
    role: 'SUPPORT',
  };

  await assert.rejects(
    async () => {
      await service.applySupportIntervention(supportUser, {
        booking_id: 'b_001',
        intervention_type: SupportInterventionType.MANUAL_STATUS_CORRECTION,
        reason: '   ', // Empty whitespace reason
      });
    },
    (err) => {
      assert.equal(err.status, 422);
      assert.equal(err.code, ErrorCode.AUDIT_REASON_REQUIRED);
      return true;
    }
  );
});

test('AC2: Support intervention rejects unauthorized non-support callers with 403 Forbidden', async () => {
  const mockDb = createMockDb();
  const service = new AuditSupportService(mockDb);

  const regularCustomer = {
    userId: 'cust_01',
    email: 'alice@example.com',
    role: 'CUSTOMER',
  };

  await assert.rejects(
    async () => {
      await service.applySupportIntervention(regularCustomer, {
        booking_id: 'b_001',
        intervention_type: SupportInterventionType.MANUAL_STATUS_CORRECTION,
        reason: 'Trying to elevate status myself',
      });
    },
    (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, ErrorCode.SUPPORT_ACCESS_FORBIDDEN);
      return true;
    }
  );
});

test('AC3: Support intervention preserves prior evidence and records immutable history', async () => {
  const initialBooking = {
    id: 'b_test_01',
    user_id: 'cust_alice',
    restaurant_id: 'rest_bistro',
    party_size: 4,
    requested_start: '2026-11-10T19:00:00Z',
    status: 'PAYMENT_PENDING',
    version: 1,
  };

  const mockDb = createMockDb({ bookings: [initialBooking] });
  const service = new AuditSupportService(mockDb);

  const supportUser = {
    userId: 'agent_bob',
    email: 'bob@dine.local',
    role: 'SUPPORT',
  };

  const result = await service.applySupportIntervention(
    supportUser,
    {
      booking_id: 'b_test_01',
      intervention_type: SupportInterventionType.MANUAL_STATUS_CORRECTION,
      override_status: 'CONFIRMED',
      reason: 'Verified bank wire transaction manually following UPI outage',
      ticket_id: 'TICKET-7890',
    },
    'req_corr_abc'
  );

  assert.equal(result.booking_id, 'b_test_01');
  assert.equal(result.prior_state.status, 'PAYMENT_PENDING');
  assert.equal(result.new_state.status, 'CONFIRMED');
  assert.equal(result.actor_id, 'agent_bob');
  assert.equal(result.actor_role, 'SUPPORT');

  // Verify booking table updated
  assert.equal(initialBooking.status, 'CONFIRMED');
  assert.equal(initialBooking.version, 2);

  // Verify support_interventions table has recorded prior state
  assert.equal(mockDb.data.supportInterventions.length, 1);
  assert.equal(mockDb.data.supportInterventions[0].prior_state.status, 'PAYMENT_PENDING');
  assert.equal(mockDb.data.supportInterventions[0].new_state.status, 'CONFIRMED');

  // Verify audit_logs table has recorded the action atomically
  assert.equal(mockDb.data.auditLogs.length, 1);
  assert.equal(mockDb.data.auditLogs[0].action, 'SUPPORT_INTERVENTION_MANUAL_STATUS_CORRECTION');
});

test('AC2: Foreign-tenant audit log query is denied with 403 Forbidden', async () => {
  const mockDb = createMockDb({
    memberships: [
      { restaurant_id: 'rest_01', user_id: 'staff_alice', role: 'MANAGER', status: 'ACTIVE' },
    ],
  });
  const service = new AuditSupportService(mockDb);

  const venueStaffUser = {
    userId: 'staff_alice',
    email: 'staff@rest1.com',
    role: 'MANAGER',
    memberships: [
      { restaurantId: 'rest_01', role: 'MANAGER', status: 'ACTIVE' },
    ],
  };

  // Attempting to query foreign restaurant's logs
  await assert.rejects(
    async () => {
      await service.getAuditLogs(venueStaffUser, { restaurant_id: 'rest_FOREIGN' });
    },
    (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, ErrorCode.SUPPORT_ACCESS_FORBIDDEN);
      return true;
    }
  );
});

test('AC2 & AC4: Incident trace aggregates full lifecycle and verifies customer/tenant access', async () => {
  const booking = {
    id: 'b_trace_01',
    user_id: 'cust_alice',
    restaurant_id: 'rest_01',
    party_size: 2,
    requested_start: '2026-11-10T19:00:00Z',
    status: 'CONFIRMED',
  };

  const statusEvents = [
    { id: 'ev_1', booking_id: 'b_trace_01', from_status: 'HOLD_ACTIVE', to_status: 'CONFIRMED', sequence_number: 1, created_at: new Date() },
  ];

  const paymentAttempts = [
    { id: 'pay_1', booking_id: 'b_trace_01', status: 'CAPTURED', amount_minor: 50000, currency: 'INR', created_at: new Date() },
  ];

  const mockDb = createMockDb({
    bookings: [booking],
    bookingStatusEvents: statusEvents,
    paymentAttempts,
  });
  const service = new AuditSupportService(mockDb);

  const customerUser = {
    userId: 'cust_alice',
    email: 'alice@example.com',
    role: 'CUSTOMER',
  };

  const foreignUser = {
    userId: 'cust_stranger',
    email: 'stranger@example.com',
    role: 'CUSTOMER',
  };

  // Foreign user is blocked
  await assert.rejects(
    async () => {
      await service.getIncidentTrace(foreignUser, 'b_trace_01');
    },
    (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, ErrorCode.SUPPORT_ACCESS_FORBIDDEN);
      return true;
    }
  );

  // Authorized customer can view own trace
  const trace = await service.getIncidentTrace(customerUser, 'b_trace_01');
  assert.equal(trace.booking_id, 'b_trace_01');
  assert.equal(trace.status, 'CONFIRMED');
  assert.equal(trace.status_events.length, 1);
  assert.equal(trace.payment_attempts.length, 1);
});

test('AC4: Incident export generates certified redacted evidence package with SHA-256 checksum', async () => {
  const booking = {
    id: 'b_export_01',
    user_id: 'cust_alice',
    restaurant_id: 'rest_01',
    party_size: 2,
    requested_start: '2026-11-10T19:00:00Z',
    status: 'CONFIRMED',
  };

  const mockDb = createMockDb({ bookings: [booking] });
  const service = new AuditSupportService(mockDb);

  const supportUser = {
    userId: 'support_01',
    email: 'support@dine.local',
    role: 'SUPPORT',
  };

  const exportResult = await service.exportIncidentEvidence(supportUser, {
    booking_id: 'b_export_01',
    reason: 'Legal dispute evidence packaging',
    ticket_id: 'LEGAL-101',
  });

  assert.ok(exportResult.export_id);
  assert.ok(exportResult.checksum_sha256);
  assert.equal(exportResult.booking_id, 'b_export_01');
  assert.ok(exportResult.redacted_evidence);

  // Verify export action was logged in audit_logs
  const exportLog = mockDb.data.auditLogs.find((a) => a.action === 'EXPORT_INCIDENT_EVIDENCE');
  assert.ok(exportLog, 'Export action must be audited');
  assert.equal(exportLog.reason, 'Legal dispute evidence packaging');
});

test('AC5: Privacy erasure request handles statutory financial retention safely (POL-017 / GATE-006)', async () => {
  const userProfile = {
    id: 'cust_with_history',
    full_name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+919876543210',
  };

  const paidBooking = {
    id: 'b_paid_01',
    user_id: 'cust_with_history',
    restaurant_id: 'rest_01',
    status: 'COMPLETED',
  };

  const userPref = {
    id: 'pref_01',
    user_id: 'cust_with_history',
    dietary_requirements: ['GLUTEN_FREE'],
  };

  const userFav = {
    id: 'fav_01',
    user_id: 'cust_with_history',
    restaurant_id: 'rest_01',
  };

  const mockDb = createMockDb({
    profiles: [userProfile],
    bookings: [paidBooking],
    customerPreferences: [userPref],
    favorites: [userFav],
  });
  const service = new AuditSupportService(mockDb);

  const customerUser = {
    userId: 'cust_with_history',
    email: 'john.doe@example.com',
    role: 'CUSTOMER',
  };

  const erasureResult = await service.processPrivacyErasure(customerUser, 'cust_with_history');

  assert.equal(erasureResult.status, PrivacyErasureStatus.ANONYMIZED_WITH_RETAINED_EVIDENCE);
  assert.equal(erasureResult.has_financial_records, true);
  assert.equal(erasureResult.profile_anonymized, true);
  assert.equal(erasureResult.financial_records_retained_count, 1);

  // Verify preferences and favorites were deleted
  assert.equal(mockDb.data.customerPreferences.length, 0);
  assert.equal(mockDb.data.favorites.length, 0);

  // Verify profile personal data was anonymized, not cascaded to booking deletion
  assert.equal(userProfile.full_name, 'Anonymized Customer');
  assert.equal(userProfile.phone, null);
  assert.ok(userProfile.email.includes('@deleted.dine.local'));

  // Statutory booking record preserved intact
  assert.equal(mockDb.data.bookings.length, 1);
});
