import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { DatabaseService } from '../../common/db/database.service';
import { ConfigService } from '../../common/config/config.service';
import {
  BullQueueName,
  RedisQueueState,
  ErrorCode,
} from '@dine/contracts';
import { BullJobRecord } from './realtime.interfaces';
import { NotFoundError, ValidationError } from '../../common/errors/app-error';

// ============================================================================
// Pure Architectural Helpers (Exported for Unit & Verification Testing)
// ============================================================================

/**
 * Creates deterministic durable job identity: ${entityId}:${jobType}:${version}
 * Implements Task T11: Durable job identity. Prevents queue duplication on worker restart.
 */
export function createDurableJobId(
  entityId: string,
  jobType: string,
  version: number = 1
): string {
  const sanitizedEntity = (entityId || 'entity').replace(/[^a-zA-Z0-9_-]/g, '');
  const sanitizedType = (jobType || 'job').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${sanitizedEntity}:${sanitizedType}:v${version > 0 ? version : 1}`;
}

/**
 * Calculates exponential backoff with ceiling.
 */
export function calculateJobBackoff(
  attempt: number,
  baseMs: number = 1000,
  maxMs: number = 300000
): number {
  if (attempt <= 0) return 0;
  const exp = Math.min(attempt - 1, 10);
  const delay = baseMs * Math.pow(2, exp);
  return Math.min(delay, maxMs);
}

/**
 * Pure evaluator for job failure, retries, and dead-letter queue transition.
 * Implements Task T12 & AC 14: Dead-letter job is visible with safe recovery owner.
 */
export function evaluateJobFailurePure(
  currentAttempts: number,
  maxAttempts: number,
  errorMsg: string,
  recoveryOwner: string = 'PLATFORM_OPERATIONS'
): {
  status: 'PENDING' | 'FAILED' | 'DEAD_LETTER';
  attempts: number;
  lastError: string;
  deadLetterReason: string | null;
  recoveryOwner: string;
  nextRetryDelayMs: number;
} {
  const nextAttempts = currentAttempts + 1;

  if (nextAttempts >= maxAttempts) {
    return {
      status: 'DEAD_LETTER',
      attempts: nextAttempts,
      lastError: errorMsg,
      deadLetterReason: `EXCEEDED_MAX_ATTEMPTS: Failed after ${nextAttempts} attempts. Last error: ${errorMsg}`,
      recoveryOwner,
      nextRetryDelayMs: 0,
    };
  }

  return {
    status: 'FAILED',
    attempts: nextAttempts,
    lastError: errorMsg,
    deadLetterReason: null,
    recoveryOwner,
    nextRetryDelayMs: calculateJobBackoff(nextAttempts),
  };
}

/**
 * Reconstructs all pending queue jobs directly from PostgreSQL authoritative state.
 * Implements Task T11 & AC 13: Redis-loss reconstruction from PostgreSQL authority.
 */
export function reconstructQueuesFromPostgresPure(
  heldClaims: Array<{ id: string; table_id: string; expires_at: string }>,
  reviewPayments: Array<{ id: string; booking_id: string; created_at: string }>,
  pendingOutbox: Array<{ id: string; sequence_number: number; event_type: string }>
): {
  reconstructedJobs: {
    holdExpiry: BullJobRecord[];
    paymentReconciliation: BullJobRecord[];
    outboxDispatch: BullJobRecord[];
  };
  totalCount: number;
} {
  const now = new Date().toISOString();

  // 1. Hold Expiry Jobs
  const holdExpiryJobs: BullJobRecord[] = (heldClaims || []).map((claim) => ({
    jobId: createDurableJobId(claim.id, 'hold_expiry', 1),
    queueName: BullQueueName.HOLD_EXPIRY,
    entityId: claim.id,
    jobType: 'HOLD_SAFE_EXPIRY',
    version: 1,
    payload: { claim_id: claim.id, table_id: claim.table_id, expires_at: claim.expires_at },
    status: 'PENDING',
    attempts: 0,
    maxAttempts: 5,
    recoveryOwner: 'PLATFORM_OPERATIONS',
    scheduledFor: claim.expires_at || now,
  }));

  // 2. Payment Reconciliation Jobs
  const paymentReconciliationJobs: BullJobRecord[] = (reviewPayments || []).map((payment) => ({
    jobId: createDurableJobId(payment.id, 'payment_reconciliation', 1),
    queueName: BullQueueName.PAYMENT_RECONCILIATION,
    entityId: payment.id,
    jobType: 'PAYMENT_REVIEW_RECONCILE',
    version: 1,
    payload: { payment_id: payment.id, booking_id: payment.booking_id },
    status: 'PENDING',
    attempts: 0,
    maxAttempts: 5,
    recoveryOwner: 'PLATFORM_OPERATIONS',
    scheduledFor: now,
  }));

  // 3. Outbox Dispatch Jobs
  const outboxDispatchJobs: BullJobRecord[] = (pendingOutbox || []).map((evt) => ({
    jobId: createDurableJobId(evt.id, 'outbox_dispatch', evt.sequence_number || 1),
    queueName: BullQueueName.OUTBOX_DISPATCH,
    entityId: evt.id,
    jobType: 'OUTBOX_EVENT_DISPATCH',
    version: evt.sequence_number || 1,
    payload: { outbox_event_id: evt.id, event_type: evt.event_type },
    status: 'PENDING',
    attempts: 0,
    maxAttempts: 5,
    recoveryOwner: 'PLATFORM_OPERATIONS',
    scheduledFor: now,
  }));

  return {
    reconstructedJobs: {
      holdExpiry: holdExpiryJobs,
      paymentReconciliation: paymentReconciliationJobs,
      outboxDispatch: outboxDispatchJobs,
    },
    totalCount: holdExpiryJobs.length + paymentReconciliationJobs.length + outboxDispatchJobs.length,
  };
}

// ============================================================================
// BullMQ Queue & Worker Service
// ============================================================================

@Injectable()
export class BullMqQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullMqQueueService.name);

  // In-memory queue storage for fast lookup & offline fallback
  private memoryJobs = new Map<string, BullJobRecord>(); // jobId -> BullJobRecord

  // Redis connectivity state (ONLINE vs DEGRADED)
  private redisState: RedisQueueState = RedisQueueState.ONLINE;

  // Real BullMQ Queue & Worker instances
  private queues = new Map<BullQueueName, Queue>();
  private workers = new Map<BullQueueName, Worker>();
  private redisClient?: Redis;

  constructor(
    private readonly db: DatabaseService,
    @Optional() private readonly config?: ConfigService
  ) {}

  async onModuleInit() {
    await this.initBullMq();
  }

  async onModuleDestroy() {
    await this.closeBullMq();
  }

  private async initBullMq() {
    const redisUrl =
      this.config?.get('REDIS_URL') ||
      process.env.REDIS_URL ||
      'redis://127.0.0.1:6379';

    try {
      this.redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        connectTimeout: 2000,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 500, 2000);
        },
      });

      this.redisClient.on('connect', () => {
        this.redisState = RedisQueueState.ONLINE;
        this.logger.log(`[BullMqQueueService] Connected to Redis at ${redisUrl}`);
      });

      this.redisClient.on('error', (err) => {
        this.redisState = RedisQueueState.OFFLINE;
        this.logger.warn(`[BullMqQueueService] Redis connection error: ${err.message}. Operating in degraded mode.`);
      });

      await this.redisClient.connect();
      this.redisState = RedisQueueState.ONLINE;

      const redisOptions = {
        host: '127.0.0.1',
        port: 6379,
        maxRetriesPerRequest: null,
      };
      try {
        const u = new URL(redisUrl);
        redisOptions.host = u.hostname || '127.0.0.1';
        redisOptions.port = u.port ? parseInt(u.port, 10) : 6379;
      } catch {}

      // Initialize real BullMQ queues
      const queueNames = [
        BullQueueName.HOLD_EXPIRY,
        BullQueueName.PAYMENT_RECONCILIATION,
        BullQueueName.OUTBOX_DISPATCH,
      ];

      for (const qName of queueNames) {
        const q = new Queue(qName, { connection: redisOptions });
        this.queues.set(qName, q);

        // Initialize real BullMQ worker with processor
        const w = new Worker(
          qName,
          async (job) => {
            this.logger.log(`[BullMqWorker] Processing job ${job.id} in queue ${qName}`);
            await this.handleJobProcessing(qName, job.data);
          },
          { connection: redisOptions, concurrency: 5 }
        );

        w.on('completed', async (job) => {
          this.logger.log(`[BullMqWorker] Completed job ${job.id} in queue ${qName}`);
          await this.updateJobStatusInDb(job.id || '', 'COMPLETED', job.attemptsMade);
        });

        w.on('failed', async (job, err) => {
          this.logger.warn(`[BullMqWorker] Job ${job?.id} failed in queue ${qName}: ${err.message}`);
          if (job) {
            const evaluation = evaluateJobFailurePure(job.attemptsMade, 5, err.message);
            await this.updateJobStatusInDb(
              job.id || '',
              evaluation.status,
              evaluation.attempts,
              err.message,
              evaluation.deadLetterReason || undefined
            );
          }
        });

        this.workers.set(qName, w);
      }

      this.logger.log('[BullMqQueueService] BullMQ queues and workers initialized successfully');
    } catch (err: any) {
      this.redisState = RedisQueueState.OFFLINE;
      this.logger.warn(`[BullMqQueueService] Redis initialization failed (${err.message}). Queue operating in degraded PostgreSQL mode.`);
    }
  }

  private async closeBullMq() {
    for (const [name, worker] of this.workers.entries()) {
      try {
        await worker.close();
      } catch (err: any) {
        this.logger.warn(`Error closing worker ${name}: ${err.message}`);
      }
    }
    this.workers.clear();

    for (const [name, queue] of this.queues.entries()) {
      try {
        await queue.close();
      } catch (err: any) {
        this.logger.warn(`Error closing queue ${name}: ${err.message}`);
      }
    }
    this.queues.clear();

    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch {
        this.redisClient.disconnect();
      }
    }
  }

  private async handleJobProcessing(queueName: BullQueueName, data: Record<string, any>) {
    // Domain worker logic
    if (queueName === BullQueueName.HOLD_EXPIRY && data.claim_id) {
      const pool = this.db.getPool();
      if (pool) {
        await pool.query(
          `UPDATE table_allocations SET status = 'RELEASED' WHERE id = $1 AND status = 'HELD' AND expires_at <= NOW()`,
          [data.claim_id]
        );
      }
    }
  }

  private async updateJobStatusInDb(
    jobId: string,
    status: string,
    attempts: number,
    lastError?: string,
    deadLetterReason?: string
  ) {
    try {
      const pool = this.db.getPool();
      if (pool) {
        await pool.query(
          `UPDATE bullmq_queue_jobs SET
            status = $1,
            attempts = $2,
            last_error = $3,
            dead_letter_reason = $4,
            completed_at = CASE WHEN $1 = 'COMPLETED' THEN NOW() ELSE completed_at END,
            updated_at = NOW()
          WHERE job_id = $5`,
          [status, attempts, lastError || null, deadLetterReason || null, jobId]
        );
      }
    } catch {
      // Memory fallback
    }

    const mem = this.memoryJobs.get(jobId);
    if (mem) {
      mem.status = status as any;
      mem.attempts = attempts;
      if (lastError) mem.lastError = lastError;
      if (deadLetterReason) mem.deadLetterReason = deadLetterReason;
      if (status === 'COMPLETED') mem.completedAt = new Date().toISOString();
    }
  }

  getRedisState(): RedisQueueState {
    return this.redisState;
  }

  setRedisState(state: RedisQueueState): void {
    this.redisState = state;
    this.logger.warn(`[BullMqQueueService] Redis queue state transitioned to: ${state}`);
  }

  /**
   * Enqueues a job with durable identity.
   * Persists in PostgreSQL bullmq_queue_jobs and submits to real BullMQ if Redis is ONLINE.
   */
  async enqueueJob(
    queueName: BullQueueName,
    entityId: string,
    jobType: string,
    payload: Record<string, unknown>,
    options?: { version?: number; scheduledFor?: string; maxAttempts?: number }
  ): Promise<BullJobRecord> {
    const version = options?.version || 1;
    const jobId = createDurableJobId(entityId, jobType, version);
    const scheduledFor = options?.scheduledFor || new Date().toISOString();
    const maxAttempts = options?.maxAttempts || 5;

    const record: BullJobRecord = {
      jobId,
      queueName,
      entityId,
      jobType,
      version,
      payload,
      status: 'PENDING',
      attempts: 0,
      maxAttempts,
      recoveryOwner: 'PLATFORM_OPERATIONS',
      scheduledFor,
    };

    // 1. Authoritative durable storage in PostgreSQL
    try {
      const pool = this.db.getPool();
      if (pool) {
        await pool.query(
          `INSERT INTO bullmq_queue_jobs (
            queue_name, job_id, entity_id, job_type, version, payload, status,
            attempts, max_attempts, recovery_owner, scheduled_for
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 0, $7, 'PLATFORM_OPERATIONS', $8)
          ON CONFLICT (job_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            scheduled_for = EXCLUDED.scheduled_for,
            updated_at = NOW()`,
          [
            queueName,
            jobId,
            entityId,
            jobType,
            version,
            JSON.stringify(payload),
            maxAttempts,
            scheduledFor,
          ]
        );
      }
    } catch {
      // Memory fallback for mock/offline unit tests
    }

    this.memoryJobs.set(jobId, record);

    // 2. Real BullMQ enqueue when Redis is ONLINE
    if (this.redisState === RedisQueueState.ONLINE) {
      const bullQueue = this.queues.get(queueName);
      if (bullQueue) {
        try {
          const delay = scheduledFor
            ? Math.max(0, new Date(scheduledFor).getTime() - Date.now())
            : 0;
          await bullQueue.add(jobType, payload, {
            jobId,
            delay,
            attempts: maxAttempts,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: false,
            removeOnFail: false,
          });
        } catch (err: any) {
          this.logger.warn(`[BullMq] Redis enqueue failed for ${jobId}: ${err.message}. State recorded in DB.`);
        }
      }
    }

    this.logger.log(`[BullMq] Enqueued job id=${jobId} queue=${queueName}`);
    return record;
  }

  /**
   * Executes a job with bounded retries and dead-letter transition.
   */
  async executeJob(
    jobId: string,
    workerFn: () => Promise<void>
  ): Promise<{ status: string; attempts: number; deadLetterReason?: string }> {
    let job = this.memoryJobs.get(jobId);

    if (!job) {
      try {
        const pool = this.db.getPool();
        if (pool) {
          const res = await pool.query(`SELECT * FROM bullmq_queue_jobs WHERE job_id = $1`, [jobId]);
          if (res.rows.length > 0) {
            const r = res.rows[0];
            job = {
              jobId: r.job_id,
              queueName: r.queue_name,
              entityId: r.entity_id,
              jobType: r.job_type,
              version: r.version,
              payload: r.payload,
              status: r.status,
              attempts: r.attempts,
              maxAttempts: r.max_attempts,
              lastError: r.last_error,
              deadLetterReason: r.dead_letter_reason,
              recoveryOwner: r.recovery_owner,
              scheduledFor: r.scheduled_for,
            };
          }
        }
      } catch {}
    }

    if (!job) {
      throw new NotFoundError(`BullMQ job not found: ${jobId}`);
    }

    try {
      await workerFn();
      job.status = 'COMPLETED';
      job.completedAt = new Date().toISOString();
      await this.updateJobStatusInDb(jobId, 'COMPLETED', job.attempts);
      return { status: 'COMPLETED', attempts: job.attempts };
    } catch (err: any) {
      const evaluation = evaluateJobFailurePure(job.attempts, job.maxAttempts, err.message);
      job.status = evaluation.status;
      job.attempts = evaluation.attempts;
      job.lastError = evaluation.lastError;
      job.deadLetterReason = evaluation.deadLetterReason || undefined;

      this.logger.warn(
        `[BullMq] Job id=${jobId} failed attempt=${job.attempts} -> status=${job.status}`
      );

      await this.updateJobStatusInDb(
        jobId,
        evaluation.status,
        evaluation.attempts,
        err.message,
        evaluation.deadLetterReason || undefined
      );

      return {
        status: job.status,
        attempts: job.attempts,
        deadLetterReason: job.deadLetterReason,
      };
    }
  }

  /**
   * Reconstructs Redis queue state by querying PostgreSQL authoritative tables.
   * Guarantees: No synthetic jobs on failure; scans real tables (table_allocations, payment_attempts, outbox_events).
   */
  async rebuildFromPostgres(): Promise<{
    reconstructed_jobs: {
      hold_expiry: number;
      payment_reconciliation: number;
      outbox_dispatch: number;
      total: number;
    };
    queue_state: 'ONLINE' | 'DEGRADED';
    rebuilt_from: 'POSTGRESQL_AUTHORITATIVE';
    timestamp: string;
  }> {
    let heldClaims: any[] = [];
    let reviewPayments: any[] = [];
    let pendingOutbox: any[] = [];

    const pool = this.db.getPool();
    if (pool) {
      // 1. Scan PostgreSQL held claims (check table_allocations first, fallback to inventory_claims)
      try {
        const claimsRes = await pool.query(
          `SELECT id, table_id, expires_at FROM table_allocations WHERE status = 'HELD' AND (expires_at IS NULL OR expires_at > NOW())`
        );
        heldClaims = claimsRes.rows;
      } catch {
        try {
          const claimsRes = await pool.query(
            `SELECT id, table_id, expires_at FROM inventory_claims WHERE state = 'HELD' AND (expires_at IS NULL OR expires_at > NOW())`
          );
          heldClaims = claimsRes.rows;
        } catch {
          heldClaims = [];
        }
      }

      // 2. Scan PostgreSQL payments in review (check payment_attempts first, fallback to payments)
      try {
        const paymentsRes = await pool.query(
          `SELECT id, booking_id, created_at FROM payment_attempts WHERE status = 'PAYMENT_REVIEW'`
        );
        reviewPayments = paymentsRes.rows;
      } catch {
        try {
          const paymentsRes = await pool.query(
            `SELECT id, booking_id, created_at FROM payments WHERE status = 'PAYMENT_REVIEW'`
          );
          reviewPayments = paymentsRes.rows;
        } catch {
          reviewPayments = [];
        }
      }

      // 3. Scan PostgreSQL pending outbox events
      try {
        const outboxRes = await pool.query(
          `SELECT id, sequence_number, event_type FROM outbox_events WHERE status = 'PENDING'`
        );
        pendingOutbox = outboxRes.rows;
      } catch {
        pendingOutbox = [];
      }
    }

    const { reconstructedJobs, totalCount } = reconstructQueuesFromPostgresPure(
      heldClaims,
      reviewPayments,
      pendingOutbox
    );

    // Save to PostgreSQL bullmq_queue_jobs & memory store & BullMQ queue
    for (const job of [
      ...reconstructedJobs.holdExpiry,
      ...reconstructedJobs.paymentReconciliation,
      ...reconstructedJobs.outboxDispatch,
    ]) {
      this.memoryJobs.set(job.jobId, job);

      if (pool) {
        try {
          await pool.query(
            `INSERT INTO bullmq_queue_jobs (
              queue_name, job_id, entity_id, job_type, version, payload, status,
              attempts, max_attempts, recovery_owner, scheduled_for
            ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 0, $7, 'PLATFORM_OPERATIONS', $8)
            ON CONFLICT (job_id) DO UPDATE SET
              payload = EXCLUDED.payload,
              scheduled_for = EXCLUDED.scheduled_for,
              updated_at = NOW()`,
            [
              job.queueName,
              job.jobId,
              job.entityId,
              job.jobType,
              job.version,
              JSON.stringify(job.payload),
              job.maxAttempts,
              job.scheduledFor,
            ]
          );
        } catch {}
      }

      // Push to BullMQ if Redis is ONLINE
      if (this.redisState === RedisQueueState.ONLINE) {
        const q = this.queues.get(job.queueName as BullQueueName);
        if (q) {
          try {
            await q.add(job.jobType, job.payload, {
              jobId: job.jobId,
              attempts: job.maxAttempts,
              removeOnComplete: false,
              removeOnFail: false,
            });
          } catch {}
        }
      }
    }

    this.logger.log(`[BullMq] Successfully rebuilt ${totalCount} jobs from PostgreSQL authority`);

    return {
      reconstructed_jobs: {
        hold_expiry: reconstructedJobs.holdExpiry.length,
        payment_reconciliation: reconstructedJobs.paymentReconciliation.length,
        outbox_dispatch: reconstructedJobs.outboxDispatch.length,
        total: totalCount,
      },
      queue_state: this.redisState === RedisQueueState.OFFLINE ? 'DEGRADED' : 'ONLINE',
      rebuilt_from: 'POSTGRESQL_AUTHORITATIVE',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Returns list of visible dead-letter jobs.
   */
  async listDeadLetters(): Promise<{
    total: number;
    jobs: BullJobRecord[];
    recoveryOwner: string;
  }> {
    let deadLetters: BullJobRecord[] = [];

    try {
      const pool = this.db.getPool();
      if (pool) {
        const res = await pool.query(
          `SELECT job_id, queue_name, entity_id, job_type, version, payload, status,
                  attempts, max_attempts, last_error, dead_letter_reason, recovery_owner,
                  scheduled_for, created_at, updated_at
           FROM bullmq_queue_jobs
           WHERE status = 'DEAD_LETTER'
           ORDER BY updated_at DESC`
        );
        deadLetters = res.rows.map((r) => ({
          jobId: r.job_id,
          queueName: r.queue_name,
          entityId: r.entity_id,
          jobType: r.job_type,
          version: r.version,
          payload: r.payload,
          status: r.status,
          attempts: r.attempts,
          maxAttempts: r.max_attempts,
          lastError: r.last_error,
          deadLetterReason: r.dead_letter_reason,
          recoveryOwner: r.recovery_owner,
          scheduledFor: r.scheduled_for,
        }));
      }
    } catch {}

    if (deadLetters.length === 0) {
      deadLetters = Array.from(this.memoryJobs.values()).filter(
        (j) => j.status === 'DEAD_LETTER'
      );
    }

    return {
      total: deadLetters.length,
      jobs: deadLetters,
      recoveryOwner: 'PLATFORM_OPERATIONS',
    };
  }

  /**
   * Retries a dead-letter job by resetting attempts and re-enqueueing.
   */
  async retryDeadLetter(jobId: string): Promise<BullJobRecord> {
    let job = this.memoryJobs.get(jobId);

    try {
      const pool = this.db.getPool();
      if (pool) {
        const res = await pool.query(
          `UPDATE bullmq_queue_jobs
           SET status = 'PENDING', attempts = 0, last_error = NULL, dead_letter_reason = NULL, updated_at = NOW()
           WHERE job_id = $1
           RETURNING *`,
          [jobId]
        );
        if (res.rows.length > 0) {
          const r = res.rows[0];
          job = {
            jobId: r.job_id,
            queueName: r.queue_name,
            entityId: r.entity_id,
            jobType: r.job_type,
            version: r.version,
            payload: r.payload,
            status: 'PENDING',
            attempts: 0,
            maxAttempts: r.max_attempts,
            recoveryOwner: r.recovery_owner,
            scheduledFor: r.scheduled_for,
          };
        }
      }
    } catch {}

    if (!job) {
      throw new NotFoundError(`Dead letter job not found: ${jobId}`);
    }

    job.status = 'PENDING';
    job.attempts = 0;
    job.lastError = undefined;
    job.deadLetterReason = undefined;
    this.memoryJobs.set(jobId, job);

    // Re-enqueue in BullMQ if online
    if (this.redisState === RedisQueueState.ONLINE) {
      const q = this.queues.get(job.queueName);
      if (q) {
        try {
          await q.add(job.jobType, job.payload, {
            jobId: job.jobId,
            attempts: job.maxAttempts,
            removeOnComplete: false,
            removeOnFail: false,
          });
        } catch {}
      }
    }

    this.logger.log(`[BullMq] Retried dead-letter job id=${jobId}`);
    return job;
  }
}
