import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { HealthService } from './health.service';

@ApiTags('Health & Readiness')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health/live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Application process is alive' })
  getLiveness() {
    return this.healthService.getLiveness();
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'Application is ready to receive traffic' })
  @ApiResponse({ status: 503, description: 'Application dependencies unavailable' })
  async getReadiness(@Res() res: Response) {
    const { isReady, report } = await this.healthService.checkReadiness();
    const status = isReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(status).json(report);
  }

  @Get('v1/health')
  @ApiOperation({ summary: 'API Versioned Health Check' })
  @ApiResponse({ status: 200, description: 'API health and dependency metrics' })
  async getApiHealth(@Res() res: Response) {
    const { isReady, report } = await this.healthService.checkReadiness();
    const status = isReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(status).json(report);
  }
}
