import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { HealthResponseDto } from '@dine/contracts';

@Injectable()
export class HealthService {
  constructor(private readonly dbService: DatabaseService) {}

  async checkReadiness(): Promise<{ isReady: boolean; report: HealthResponseDto }> {
    const dbHealth = await this.dbService.healthCheck();

    const report: HealthResponseDto = {
      status: dbHealth.ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: {
        database: {
          status: dbHealth.ok ? 'up' : 'down',
          latency_ms: dbHealth.latencyMs,
        },
      },
    };

    return {
      isReady: dbHealth.ok,
      report,
    };
  }

  getLiveness(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
