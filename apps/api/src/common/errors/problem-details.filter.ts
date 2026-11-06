import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ProblemDetails, ErrorCode } from '@dine/contracts';
import { AppError } from './app-error';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = (request.headers['x-request-id'] as string) || 'req_anonymous';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail = 'An unexpected server error occurred';
    let code: string = ErrorCode.INTERNAL_SERVER_ERROR;
    let invalidParams: Array<{ name: string; reason: string }> | undefined;

    if (exception instanceof AppError) {
      status = exception.status;
      detail = exception.message;
      code = exception.code;
      invalidParams = exception.invalidParams;
      title = this.getTitleForStatus(status);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      title = this.getTitleForStatus(status);
      if (typeof res === 'string') {
        detail = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, any>;
        detail = body.message || exception.message;
        if (Array.isArray(body.message)) {
          detail = body.message.join('; ');
        }
        code = body.error || this.getCodeForStatus(status);
      }
    } else if (exception instanceof Error) {
      // Check for PostgreSQL GiST conflict (23P01 exclusion_violation)
      const pgError = exception as any;
      if (pgError.code === '23P01') {
        status = HttpStatus.CONFLICT;
        code = ErrorCode.INVENTORY_HOLD_CONFLICT;
        title = 'Inventory Hold Conflict';
        detail = 'Table allocation conflicts with an existing protected dining period.';
      } else {
        detail = process.env.NODE_ENV === 'production'
          ? 'An unexpected internal error occurred'
          : exception.message;
      }
    }

    const problem: ProblemDetails = {
      type: `https://dine.api.local/errors/${code.toLowerCase()}`,
      title,
      status,
      detail,
      instance: request.originalUrl || request.url,
      code,
      request_id: requestId,
      ...(invalidParams && { invalid_params: invalidParams }),
    };

    if (status >= 500) {
      this.logger.error(`[${requestId}] ${request.method} ${request.url} - 500: ${detail}`, (exception as any)?.stack);
    } else {
      this.logger.warn(`[${requestId}] ${request.method} ${request.url} - ${status} [${code}]: ${detail}`);
    }

    response.status(status).setHeader('Content-Type', 'application/problem+json').json(problem);
  }

  private getTitleForStatus(status: number): string {
    switch (status) {
      case 400: return 'Bad Request';
      case 401: return 'Unauthorized';
      case 403: return 'Forbidden';
      case 404: return 'Not Found';
      case 409: return 'Conflict';
      case 410: return 'Gone';
      case 422: return 'Unprocessable Entity';
      case 429: return 'Too Many Requests';
      default: return 'Internal Server Error';
    }
  }

  private getCodeForStatus(status: number): string {
    switch (status) {
      case 400: return ErrorCode.VALIDATION_ERROR;
      case 401: return ErrorCode.UNAUTHORIZED;
      case 403: return ErrorCode.FORBIDDEN;
      case 404: return ErrorCode.NOT_FOUND;
      case 409: return ErrorCode.INVENTORY_HOLD_CONFLICT;
      case 410: return ErrorCode.HOLD_EXPIRED;
      case 422: return ErrorCode.INVALID_STATE_TRANSITION;
      default: return ErrorCode.INTERNAL_SERVER_ERROR;
    }
  }
}
