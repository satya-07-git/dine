import { PoolClient } from 'pg';
import { DatabaseService } from './database.service';

export interface TransactionContext {
  client: PoolClient;
  requestId?: string;
  actorId?: string;
}

export async function runInTransaction<T>(
  dbService: DatabaseService,
  callback: (ctx: TransactionContext) => Promise<T>,
  meta?: { requestId?: string; actorId?: string }
): Promise<T> {
  return dbService.withTransaction(async (client) => {
    const ctx: TransactionContext = {
      client,
      requestId: meta?.requestId,
      actorId: meta?.actorId,
    };
    return callback(ctx);
  });
}
