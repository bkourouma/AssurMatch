import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import { ErrorCodes, type ErrorCode } from "../../../../../packages/shared/contracts/error-codes";

export interface SafeErrorResponse {
  code: ErrorCode;
  message: string;
  correlationId: string;
  /** Spec 050: activation refusals list the failing checklist controls (no sensitive data). */
  blockers?: unknown[];
  /** Spec 050: a quote form missing in the requested language names the languages that exist. */
  availableLanguages?: string[];
}

const KNOWN_ERROR_CODES = new Set<string>(Object.values(ErrorCodes));

/**
 * Spec 050 R11: an `HttpException` built with `{ code, message, ... }` keeps its explicit code, so
 * new refusals never depend on the wording regexes below. Unknown codes are ignored.
 */
function explicitDetails(error: unknown): { code?: ErrorCode; blockers?: unknown[]; availableLanguages?: string[] } {
  if (!(error instanceof HttpException)) return {};
  const body = error.getResponse();
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const code = typeof record.code === "string" && KNOWN_ERROR_CODES.has(record.code) ? record.code as ErrorCode : undefined;
  return {
    ...(code ? { code } : {}),
    ...(Array.isArray(record.blockers) ? { blockers: record.blockers } : {}),
    ...(Array.isArray(record.availableLanguages) ? { availableLanguages: record.availableLanguages.filter((value): value is string => typeof value === "string") } : {})
  };
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
  const details = explicitDetails(error);
  return {
    code: details.code ?? codeForError(error, message, status),
    message: safeMessage,
    correlationId,
    ...(details.blockers ? { blockers: details.blockers } : {}),
    ...(details.availableLanguages ? { availableLanguages: details.availableLanguages } : {})
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
const SATISFACTION_NOT_AVAILABLE_MESSAGE = "Ce questionnaire n'est plus disponible.";

function statusForError(error: unknown): number {
  if (error instanceof HttpException) return error.getStatus();
  const message = error instanceof Error ? error.message : "";
  if (message === QUOTE_NOT_AVAILABLE_MESSAGE || message === SATISFACTION_NOT_AVAILABLE_MESSAGE) return HttpStatus.NOT_FOUND;
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
