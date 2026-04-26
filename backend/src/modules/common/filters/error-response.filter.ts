import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
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

function statusForError(error: unknown): number {
  if (error instanceof HttpException) return error.getStatus();
  const message = error instanceof Error ? error.message : "";
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
    response.status(statusForError(exception)).json(toSafeErrorResponse(exception, correlationId));
  }
}

Catch()(ErrorResponseFilter);
