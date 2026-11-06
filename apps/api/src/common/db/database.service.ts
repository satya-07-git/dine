import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ConfigService } from '../config/config.service';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;
  private db!: NodePgDatabase<typeof schema>;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const connectionString = this.config.get('DATABASE_URL');
    const ssl = this.config.get('DATABASE_SSL');

    this.pool = new Pool({
      connectionString,
      min: this.config.get('DATABASE_POOL_MIN'),
      max: this.config.get('DATABASE_POOL_MAX'),
      ssl: ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err) => {
      this.logger.error(`Unexpected PostgreSQL idle client error: ${err.message}`, err.stack);
    });

    this.db = drizzle(this.pool, { schema });
    this.logger.log('DatabaseService initialized with PostgreSQL connection pool');
  }

  getDb(): NodePgDatabase<typeof schema> {
    return this.db;
  }

  getPool(): Pool {
    return this.pool;
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        const latencyMs = Date.now() - start;
        return { ok: true, latencyMs };
      } finally {
        client.release();
      }
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return { ok: false, latencyMs, error: err.message || 'Database connection error' };
    }
  }

  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('PostgreSQL connection pool drained and terminated');
    }
  }
}
