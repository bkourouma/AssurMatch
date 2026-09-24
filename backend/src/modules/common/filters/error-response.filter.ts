import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
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

/**
 * Nest answers an unmatched route with a `NotFoundException` whose message is "Cannot GET /path".
 * It is checked before the blockers, whose patterns would otherwise read the path: "/rates" gave
 * RATE_LIMITED and "/feature-flags" FEATURE_DISABLED.
 */
const UNMATCHED_ROUTE_MESSAGE = /^Cannot [A-Z]+ \//;

export function toSafeErrorResponse(
  error: unknown,
  correlationId: string,
  status: number = statusForError(error)
): SafeErrorResponse {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const safeMessage = SENSITIVE_PATTERNS.some((pattern) => pattern.test(message))
    ? "The request could not be processed safely"
    : message;
  return {
    code: codeForError(error, message, status),
    message: safeMessage,
    correlationId
  };
}

function codeForError(error: unknown, message: string, status: number): ErrorCode {
  if (error instanceof NotFoundException && UNMATCHED_ROUTE_MESSAGE.test(message)) return ErrorCodes.NOT_FOUND;
  const blocker = PUBLIC_BLOCKERS.find(([pattern]) => pattern.test(message))?.[1];
  if (blocker) return blocker;
  if (status === HttpStatus.NOT_FOUND) return ErrorCodes.NOT_FOUND;
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) return ErrorCodes.INTERNAL_ERROR;
  return ErrorCodes.VALIDATION_FAILED;
}

/**
 * Spec 045: `QuoteSubmissionService.status()` and `.withdrawConsent()` share this exact message for
 * an unknown public reference and for a wrong token, so the endpoint cannot be used to probe which
 * references exist. It matches none of the patterns below and used to fall through to 500, which
 * turned a bad withdrawal token into a server error; an exact-string check answers 404 instead,
 * without widening any of the regexes that classify other messages.
 */
const QUOTE_NOT_AVAILABLE_MESSAGE = "Quote status not available";

function statusForError(error: unknown): number {
  if (error instanceof HttpException) return error.getStatus();
  const message = error instanceof Error ? error.message : "";
  if (message === QUOTE_NOT_AVAILABLE_MESSAGE) return HttpStatus.NOT_FOUND;
  if (/rate limit/i.test(message)) return HttpStatus.TOO_MANY_REQUESTS;
  if (/auth/i.test(message)) return HttpStatus.UNAUTHORIZED;
  if (/validation|invalid/i.test(message)) return HttpStatus.BAD_REQUEST;
  if (/mfa|rbac|denied|forbidden|read_only|tenant|crm/i.test(message)) return HttpStatus.FORBIDDEN;
  if (/not found|not publicly available/i.test(message)) return HttpStatus.NOT_FOUND;
  if (/duplicate|already|conflict/i.test(message)) return HttpStatus.CONFLICT;
  if (/consent|license|disabled|not eligible/i.test(message)) return HttpStatus.UNPROCESSABLE_ENTITY;
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

export class ErrorResponseFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<{ status(status: number): { json(body: unknown): void } }>();
    const request = http.getRequest<{ headers?: Record<string, string | string[] | undefined> }>();
    const correlationIdHeader = request.headers?.["x-correlation-id"];
    const correlationId = Array.isArray(correlationIdHeader)
      ? correlationIdHeader[0] ?? crypto.randomUUID()
      : correlationIdHeader ?? crypto.randomUUID();
    const status = statusForError(exception);
    response.status(status).json(toSafeErrorResponse(exception, correlationId, status));
  }
}

Catch()(ErrorResponseFilter);
