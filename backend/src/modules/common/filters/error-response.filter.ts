import { ErrorCodes, type ErrorCode } from "../../../../../packages/shared/contracts/error-codes";

export interface SafeErrorResponse {
  code: ErrorCode;
  message: string;
  correlationId: string;
}

const SENSITIVE_PATTERNS = [/password/i, /secret/i, /token/i, /database/i, /stack/i];
const PUBLIC_BLOCKERS: Array<[RegExp, ErrorCode]> = [
  [/country/i, ErrorCodes.COUNTRY_DISABLED],
  [/product/i, ErrorCodes.PRODUCT_DISABLED],
  [/consent/i, ErrorCodes.CONSENT_REQUIRED],
  [/license/i, ErrorCodes.LICENSE_BLOCKED],
  [/rate/i, ErrorCodes.RATE_LIMITED],
  [/feature|disabled/i, ErrorCodes.FEATURE_DISABLED]
];

export function toSafeErrorResponse(error: unknown, correlationId: string): SafeErrorResponse {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const safeMessage = SENSITIVE_PATTERNS.some((pattern) => pattern.test(message))
    ? "The request could not be processed safely"
    : message;
  return {
    code: PUBLIC_BLOCKERS.find(([pattern]) => pattern.test(message))?.[1] ?? ErrorCodes.VALIDATION_FAILED,
    message: safeMessage,
    correlationId
  };
}
