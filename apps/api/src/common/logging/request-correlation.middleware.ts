import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestCorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Extract or generate X-Request-Id
    const incomingId = req.headers['x-request-id'];
    const requestId = (typeof incomingId === 'string' && incomingId.trim().length > 0)
      ? incomingId.trim()
      : `req_${randomUUID()}`;

    // Attach to request and response
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);

    next();
  }
}
