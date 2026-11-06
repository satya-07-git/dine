"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCode = void 0;
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    ErrorCode["FORBIDDEN"] = "FORBIDDEN";
    ErrorCode["NOT_FOUND"] = "NOT_FOUND";
    ErrorCode["INVENTORY_HOLD_CONFLICT"] = "INVENTORY_HOLD_CONFLICT";
    ErrorCode["HOLD_EXPIRED"] = "HOLD_EXPIRED";
    ErrorCode["INVALID_STATE_TRANSITION"] = "INVALID_STATE_TRANSITION";
    ErrorCode["PAYMENT_REQUIRED"] = "PAYMENT_REQUIRED";
    ErrorCode["IDEMPOTENCY_CONFLICT"] = "IDEMPOTENCY_CONFLICT";
    ErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    ErrorCode["INTERNAL_SERVER_ERROR"] = "INTERNAL_SERVER_ERROR";
    ErrorCode["DATABASE_UNAVAILABLE"] = "DATABASE_UNAVAILABLE";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
//# sourceMappingURL=errors.js.map