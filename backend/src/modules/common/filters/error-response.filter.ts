import { ErrorCodes, type ErrorCode } from "../../../../../packages/shared/contracts/error-codes";

export interface SafeErrorResponse {
  code: ErrorCode;
  message: string;
  correlationId: string;
}

const SENSITIVE_PATTERNS = [/password/i, /secret/i, /token/i, /database/i, /stack/i];

export function toSafeErrorResponse(error: unknown, correlationId: string): SafeErrorResponse {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const safeMessage = SENSITIVE_PATTERNS.some((pattern) => pattern.test(message))
    ? "The request could not be processed safely"
    : message;
  return {
    code: ErrorCodes.VALIDATION_FAILED,
    message: safeMessage,
    correlationId
  };
}
