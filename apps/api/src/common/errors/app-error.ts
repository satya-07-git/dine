import { ErrorCode } from '@dine/contracts';

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly status: number = 500,
    public readonly code: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    public readonly invalidParams?: Array<{ name: string; reason: string }>
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, invalidParams?: Array<{ name: string; reason: string }>) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, invalidParams);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, ErrorCode.UNAUTHORIZED);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied for requested resource', code: ErrorCode = ErrorCode.FORBIDDEN) {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', code: ErrorCode = ErrorCode.NOT_FOUND) {
    super(message, 404, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCode.INVENTORY_HOLD_CONFLICT) {
    super(message, 409, code);
  }
}

export class ExpiredError extends AppError {
  constructor(message: string = 'Requested hold or offer has expired', code: ErrorCode = ErrorCode.HOLD_EXPIRED) {
    super(message, 410, code);
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(message: string) {
    super(message, 422, ErrorCode.INVALID_STATE_TRANSITION);
  }
}
