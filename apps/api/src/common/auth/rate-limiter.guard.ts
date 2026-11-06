import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const RATE_LIMIT_KEY = 'rate_limit';
export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

interface HitRecord {
  timestamps: number[];
}

@Injectable()
export class RateLimiterGuard implements CanActivate {
  private readonly hits = new Map<string, HitRecord>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const clientIp = request.ip || request.connection?.remoteAddress || '127.0.0.1';
    const userId = request.user?.userId || 'anonymous';
    const endpoint = `${request.method}:${request.baseUrl || ''}${request.path}`;
    const key = `${clientIp}:${userId}:${endpoint}`;

    const now = Date.now();
    const windowStart = now - options.windowMs;

    let record = this.hits.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.hits.set(key, record);
    }

    // Filter out expired timestamps outside the sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= options.maxRequests) {
      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Limit of ${options.maxRequests} requests per ${Math.round(
            options.windowMs / 1000
          )} seconds exceeded.`,
          status: 429,
          retryable: false,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    record.timestamps.push(now);
    return true;
  }

  // Clear tracking map (useful for test isolation)
  reset(): void {
    this.hits.clear();
  }
}
