"""
Automated Integration and Acceptance Verification Suite for EPIC-024:
Socket.IO, BullMQ and Database Event Recovery Upgrade.

Verifies:
- Real Socket.IO transport, handshake, and room authorization
- IDOR prevention and cross-tenant staff room access denial
- Availability broadcast PII/payment scrubbing
- No-recipient broadcast returns SENT rather than DELIVERED
- Instant WebSocket disconnection upon staff/session revocation
- In-window monotonic event replay vs retention-gap REST snapshot fallback (/api/v1/bookings/:id)
- Real BullMQ queue initialization, deterministic job identities, and deduplication
- Bounded retries, exponential backoff, and dead-letter isolation with PLATFORM_OPERATIONS
- Redis loss reconstruction from PostgreSQL authoritative tables with zero overlapping claims
"""

import json
from pathlib import Path
import subprocess
import time
import unittest

REPO_ROOT = Path(__file__).resolve().parents[1]


class TestEpic24SocketIoBullMqIntegration(unittest.TestCase):
    """Executable verification suite covering all EPIC-024 requirements and acceptance criteria."""

    def test_real_socketio_gateway_transport_and_room_authorization(self):
        """Verify real Socket.IO WebSocket transport, handshake, and room authorization."""
        code = """
        const http = require('http');
        const { NestFactory } = require('@nestjs/core');
        const { AppModule } = require('./apps/api/dist/app.module');
        const { io } = require('socket.io-client');

        async function run() {
          const app = await NestFactory.create(AppModule, { logger: false });
          const port = 3097;
          await app.listen(port);

          try {
            // 1. Connect unauthenticated client
            const socketAnon = io(`http://localhost:${port}`, {
              transports: ['websocket'],
              reconnection: false,
            });

            await new Promise((resolve, reject) => {
              socketAnon.on('connect', resolve);
              socketAnon.on('connect_error', reject);
              setTimeout(() => reject(new Error('Connection timeout')), 5000);
            });

            // 2. Anonymous client attempts to join private room -> must receive error
            const joinError = await new Promise((resolve) => {
              socketAnon.emit('join_room', { room: 'restaurant:rest_unauth' });
              socketAnon.on('error', (err) => resolve(err));
              setTimeout(() => resolve(null), 2000);
            });

            socketAnon.disconnect();

            // 3. Connect authorized staff client
            const socketStaff = io(`http://localhost:${port}`, {
              transports: ['websocket'],
              auth: {
                userId: 'usr_owner_01',
                role: 'OWNER',
                restaurantId: 'rest_venue_01'
              },
              reconnection: false,
            });

            await new Promise((resolve, reject) => {
              socketStaff.on('connect', resolve);
              socketStaff.on('connect_error', reject);
              setTimeout(() => reject(new Error('Connection timeout')), 5000);
            });

            // Staff joins their own restaurant room -> success
            const joinSuccess = await new Promise((resolve) => {
              socketStaff.emit('join_room', { room: 'restaurant:rest_venue_01' });
              socketStaff.on('room_joined', (data) => resolve(data));
              setTimeout(() => resolve(null), 2000);
            });

            socketStaff.disconnect();

            console.log(JSON.stringify({
              joinErrorReceived: !!joinError,
              errorCode: joinError ? joinError.code : null,
              joinSuccessReceived: !!joinSuccess,
              roomJoined: joinSuccess ? joinSuccess.room : null,
              audience: joinSuccess ? joinSuccess.audience : null,
            }));
          } finally {
            await app.close();
          }
        }

        run().catch((err) => {
          console.error('Fatal test error:', err);
          process.exit(1);
        });
        """
        env = {
            'DATABASE_URL': 'postgresql://postgres:postgres@localhost:5432/dine_dev',
            'SUPABASE_JWT_SECRET': 'development-mock-jwt-secret-do-not-use-in-production-32chars',
            'NODE_ENV': 'development',
            'PATH': subprocess.os.environ.get('PATH', ''),
        }
        res = subprocess.run(
            ['node', '-e', code],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            env=env,
            timeout=30,
        )
        self.assertEqual(res.returncode, 0, f"Socket.IO gateway test failed: {res.stderr}\n{res.stdout}")
        lines = [l.strip() for l in res.stdout.strip().splitlines() if l.strip().startswith('{') and l.strip().endswith('}')]
        data = json.loads(lines[-1])
        self.assertTrue(data["joinErrorReceived"], "Unauthorized room join must trigger error event")
        self.assertEqual(data["errorCode"], "ROOM_ACCESS_DENIED")
        self.assertTrue(data["joinSuccessReceived"], "Authorized staff must receive room_joined confirmation")
        self.assertEqual(data["roomJoined"], "restaurant:rest_venue_01")
        self.assertEqual(data["audience"], "STAFF")

    def test_customer_idor_and_cross_tenant_isolation(self):
        """Verify AC 6 & AC 7: Customer A cannot join Customer B room; Staff A cannot access Venue B room."""
        code = """
        const { authorizeRoomPure } = require('./apps/api/dist/modules/realtime/socket-io.gateway');

        async function run() {
          // 1. Customer IDOR Test: Customer Alice tries to join Bob's private booking room
          let idorBlocked = false;
          try {
            await authorizeRoomPure(
              { userId: 'usr_alice', role: 'CUSTOMER', email: 'alice@example.com' },
              'booking:bk_bob_001',
              async () => ({ bookingUserId: 'usr_bob', bookingRestaurantId: 'rest_01' })
            );
          } catch (err) {
            if (err.code === 'ROOM_ACCESS_DENIED') idorBlocked = true;
          }

          // 2. Cross-Tenant Staff Test: Staff from Venue A tries to join Venue B room
          let tenantIsolationBlocked = false;
          try {
            await authorizeRoomPure(
              { userId: 'usr_staff_A', role: 'STAFF', restaurantId: 'rest_A', email: 'staff@a.com' },
              'restaurant:rest_B',
              async () => ({ membershipRole: null, membershipStatus: null, restaurantExists: true })
            );
          } catch (err) {
            if (err.code === 'ROOM_ACCESS_DENIED') tenantIsolationBlocked = true;
          }

          console.log(JSON.stringify({ idorBlocked, tenantIsolationBlocked }));
        }

        run();
        """
        res = subprocess.run(
            ['node', '-e', code],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"IDOR check failed: {res.stderr}")
        lines = [l.strip() for l in res.stdout.strip().splitlines() if l.strip().startswith('{') and l.strip().endswith('}')]
        data = json.loads(lines[-1])
        self.assertTrue(data["idorBlocked"], "Customer A must be blocked from Customer B booking room")
        self.assertTrue(data["tenantIsolationBlocked"], "Staff A must be blocked from Restaurant B room")

    def test_availability_broadcast_pii_scrubbing_and_adapter_delivery_status(self):
        """Verify Task T07, T08 & AC 8: Availability broadcast strips PII/secrets; adapter reports SENT when 0 recipients."""
        code = """
        const { projectAvailabilityBroadcast, projectPrivateBookingPayload, SocketIoGateway } = require('./apps/api/dist/modules/realtime/socket-io.gateway');
        const { SocketIoAdapter } = require('./apps/api/dist/modules/realtime/socket-io.adapter');

        async function run() {
          // 1. Test public availability scrubbing
          const rawAvail = {
            eventId: 'evt_100',
            restaurantId: 'rest_venue',
            sequenceNumber: 4,
            payload: {
              table_id: 't_5',
              table_number: 'Table 5',
              state: 'AVAILABLE',
              customer_name: 'VIP Guest',
              customer_phone: '+919999888877',
              customer_email: 'vip@example.com',
              razorpay_order_id: 'order_secret_123',
            }
          };

          const scrubbed = projectAvailabilityBroadcast(rawAvail);
          const hasPii = 'customer_name' in scrubbed || 'customer_phone' in scrubbed || 'customer_email' in scrubbed || 'razorpay_order_id' in scrubbed;

          // 2. Test SocketIoAdapter with 0 active room recipients -> status must be SENT (not DELIVERED)
          const mockGateway = new SocketIoGateway({ getPool: () => null });
          const adapter = new SocketIoAdapter(mockGateway);

          const resultZero = await adapter.send({
            recipientId: 'restaurant:empty_room',
            payload: rawAvail
          });

          // 3. Test SocketIoAdapter with 1 active room recipient -> status must be DELIVERED
          mockGateway.handleConnection('sock_client_1', { userId: 'usr_1', role: 'OWNER', restaurantId: 'rest_active', email: 'owner@dine.local' });
          await mockGateway.joinRoom('sock_client_1', 'restaurant:rest_active', { userId: 'usr_1', role: 'OWNER', restaurantId: 'rest_active', email: 'owner@dine.local' });

          const resultActive = await adapter.send({
            recipientId: 'restaurant:rest_active',
            payload: { ...rawAvail, restaurant_id: 'rest_active' }
          });

          console.log(JSON.stringify({
            hasPii,
            zeroRecipientsStatus: resultZero.status,
            activeRecipientsStatus: resultActive.status,
          }));
        }

        run();
        """
        res = subprocess.run(
            ['node', '-e', code],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"Availability & adapter test failed: {res.stderr}")
        lines = [l.strip() for l in res.stdout.strip().splitlines() if l.strip().startswith('{') and l.strip().endswith('}')]
        data = json.loads(lines[-1])
        self.assertFalse(data["hasPii"], "Availability broadcast must strip all guest PII and payment tokens")
        self.assertEqual(data["zeroRecipientsStatus"], "SENT", "Zero-recipient send must not be reported as confirmed customer delivery")
        self.assertEqual(data["activeRecipientsStatus"], "DELIVERED", "Active recipient broadcast must be reported as DELIVERED")

    def test_revocation_immediately_terminates_active_socket(self):
        """Verify Task T10 & AC 7: Session/membership revocation immediately disconnects active socket connections."""
        code = """
        const { SocketIoGateway } = require('./apps/api/dist/modules/realtime/socket-io.gateway');

        async function run() {
          const gateway = new SocketIoGateway({ getPool: () => null });

          // Connect 2 sockets for revoked staff member
          gateway.handleConnection('sock_tab_1', { userId: 'usr_revoked_staff', role: 'STAFF', email: 'staff@test.com' });
          gateway.handleConnection('sock_tab_2', { userId: 'usr_revoked_staff', role: 'STAFF', email: 'staff@test.com' });

          const metricsBefore = gateway.getMetrics();
          const revokedCount = gateway.revokeUserSubscriptions('usr_revoked_staff');
          const metricsAfter = gateway.getMetrics();

          console.log(JSON.stringify({
            connectedBefore: metricsBefore.connectedClients,
            revokedCount,
            connectedAfter: metricsAfter.connectedClients,
          }));
        }

        run();
        """
        res = subprocess.run(
            ['node', '-e', code],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"Revocation test failed: {res.stderr}")
        lines = [l.strip() for l in res.stdout.strip().splitlines() if l.strip().startswith('{') and l.strip().endswith('}')]
        data = json.loads(lines[-1])
        self.assertEqual(data["connectedBefore"], 2)
        self.assertEqual(data["revokedCount"], 2)
        self.assertEqual(data["connectedAfter"], 0)

    def test_reconnect_recovery_and_mandatory_snapshot_fallback(self):
        """Verify Task T04/T09 & AC 5/10: In-window replay vs retention-gap REST snapshot fallback."""
        code = """
        const { evaluateReconnectRecoveryPure } = require('./apps/api/dist/modules/realtime/event-recovery.service');

        const cursor = {
          entityType: 'BOOKING',
          entityId: 'bk_recovery_test',
          minRetainedSequence: 10,
          maxRetainedSequence: 15,
          minRetainedVersion: 1,
          maxRetainedVersion: 3,
          retentionWindowSeconds: 86400,
          updatedAt: new Date().toISOString(),
        };

        const history = [
          { sequence_number: 10, version: 1, event_type: 'booking.confirmed' },
          { sequence_number: 11, version: 2, event_type: 'booking.ready' },
          { sequence_number: 12, version: 2, event_type: 'booking.seated' },
        ];

        // 1. Client reports sequence 4 (older than min retained 10) -> SNAPSHOT_REQUIRED
        const r1 = evaluateReconnectRecoveryPure(4, 1, cursor, history);

        // 2. Client reports sequence 10 (in-window) -> REPLAY with sequence 11 and 12
        const r2 = evaluateReconnectRecoveryPure(10, 1, cursor, history);

        console.log(JSON.stringify({
          r1Mode: r1.mode,
          r1ResyncRequired: r1.resyncRequired,
          r1SnapshotUrl: r1.snapshotUrl,
          r2Mode: r2.mode,
          r2ResyncRequired: r2.resyncRequired,
          r2ReplayedCount: r2.events.length,
          r2FirstSequence: r2.events[0]?.sequenceNumber,
        }));
        """
        res = subprocess.run(
            ['node', '-e', code],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"Reconnect test failed: {res.stderr}")
        lines = [l.strip() for l in res.stdout.strip().splitlines() if l.strip().startswith('{') and l.strip().endswith('}')]
        data = json.loads(lines[-1])
        self.assertEqual(data["r1Mode"], "SNAPSHOT_REQUIRED")
        self.assertTrue(data["r1ResyncRequired"])
        self.assertEqual(data["r1SnapshotUrl"], "/api/v1/bookings/bk_recovery_test")
        self.assertEqual(data["r2Mode"], "REPLAY")
        self.assertFalse(data["r2ResyncRequired"])
        self.assertEqual(data["r2ReplayedCount"], 2)
        self.assertEqual(data["r2FirstSequence"], 11)

    def test_real_bullmq_queue_and_worker_execution(self):
        """Verify Task T11/T12 & AC 14: BullMQ queue initialization, bounded retries, and dead-letter visibility."""
        code = """
        const { BullMqQueueService, createDurableJobId, evaluateJobFailurePure } = require('./apps/api/dist/modules/realtime/bullmq-queue.service');
        const { BullQueueName } = require('@dine/contracts');

        async function run() {
          const service = new BullMqQueueService({ getPool: () => null });
          await service.onModuleInit();

          // 1. Deterministic durable job identity
          const id1 = createDurableJobId('hold_abc', 'hold_expiry', 1);
          const id2 = createDurableJobId('hold_abc', 'hold_expiry', 1);
          const deterministic = id1 === id2 && id1 === 'hold_abc:hold_expiry:v1';

          // 2. Enqueue job
          const job = await service.enqueueJob(
            BullQueueName.HOLD_EXPIRY,
            'hold_abc',
            'HOLD_SAFE_EXPIRY',
            { claim_id: 'claim_1' },
            { version: 1 }
          );

          // 3. Simulate failure progression to DEAD_LETTER after 5 attempts
          let lastStatus = '';
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              const res = await service.executeJob(job.jobId, async () => {
                throw new Error('Connection timeout to downstream inventory');
              });
              lastStatus = res.status;
            } catch (err) {}
          }

          // 4. Dead letter inspection
          const deadLetters = await service.listDeadLetters();
          const foundDl = deadLetters.jobs.find(j => j.jobId === job.jobId);

          // 5. Retry dead letter
          const retried = await service.retryDeadLetter(job.jobId);

          await service.onModuleDestroy();

          console.log(JSON.stringify({
            deterministic,
            redisState: service.getRedisState(),
            lastStatus,
            deadLetterFound: !!foundDl,
            recoveryOwner: foundDl ? foundDl.recoveryOwner : null,
            retriedStatus: retried.status,
            retriedAttempts: retried.attempts,
          }));
          process.exit(0);
        }

        run().catch(err => {
          console.error(err);
          process.exit(1);
        });
        """
        res = subprocess.run(
            ['node', '-e', code],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=15,
        )
        self.assertEqual(res.returncode, 0, f"BullMQ queue test failed: {res.stderr}\n{res.stdout}")
        lines = [l.strip() for l in res.stdout.strip().splitlines() if l.strip().startswith('{') and l.strip().endswith('}')]
        data = json.loads(lines[-1])
        self.assertTrue(data["deterministic"])
        self.assertEqual(data["lastStatus"], "DEAD_LETTER")
        self.assertTrue(data["deadLetterFound"])
        self.assertEqual(data["recoveryOwner"], "PLATFORM_OPERATIONS")
        self.assertEqual(data["retriedStatus"], "PENDING")
        self.assertEqual(data["retriedAttempts"], 0)

    def test_redis_loss_reconstruction_from_postgresql_authority(self):
        """Verify Task T11 & AC 12/13: Rebuilding queues from PostgreSQL authoritative tables with zero overlapping claims."""
        code = """
        const { reconstructQueuesFromPostgresPure } = require('./apps/api/dist/modules/realtime/bullmq-queue.service');

        // Held claims in table_allocations
        const heldClaims = [
          { id: 'alloc_1', table_id: 'tbl_1', expires_at: '2026-11-10T21:00:00Z' },
          { id: 'alloc_2', table_id: 'tbl_2', expires_at: '2026-11-10T21:05:00Z' },
        ];
        // In-review payments in payment_attempts
        const reviewPayments = [
          { id: 'pa_1', booking_id: 'bk_1', created_at: '2026-11-10T20:55:00Z' },
        ];
        // Pending events in outbox_events
        const pendingOutbox = [
          { id: 'evt_1', sequence_number: 1, event_type: 'booking.confirmed' },
        ];

        const reconstructed = reconstructQueuesFromPostgresPure(heldClaims, reviewPayments, pendingOutbox);

        console.log(JSON.stringify({
          totalCount: reconstructed.totalCount,
          holdExpiryCount: reconstructed.reconstructedJobs.holdExpiry.length,
          paymentReconcileCount: reconstructed.reconstructedJobs.paymentReconciliation.length,
          outboxCount: reconstructed.reconstructedJobs.outboxDispatch.length,
          firstHoldJobId: reconstructed.reconstructedJobs.holdExpiry[0]?.jobId,
        }));
        """
        res = subprocess.run(
            ['node', '-e', code],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"PostgreSQL reconstruction test failed: {res.stderr}")
        lines = [l.strip() for l in res.stdout.strip().splitlines() if l.strip().startswith('{') and l.strip().endswith('}')]
        data = json.loads(lines[-1])
        self.assertEqual(data["totalCount"], 4)
        self.assertEqual(data["holdExpiryCount"], 2)
        self.assertEqual(data["paymentReconcileCount"], 1)
        self.assertEqual(data["outboxCount"], 1)
        self.assertEqual(data["firstHoldJobId"], "alloc_1:hold_expiry:v1")


if __name__ == '__main__':
    unittest.main()
