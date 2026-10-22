import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";

/** Spec 070: insurer refusals carry an explicit `code`, so the HTTP status never depends on a message. */
export const InsurerErrorCodes = {
  rbacDenied: ErrorCodes.RBAC_DENIED,
  notFound: ErrorCodes.NOT_FOUND,
  validationFailed: ErrorCodes.VALIDATION_FAILED,
  conflict: ErrorCodes.CONFLICT
} as const;

export function insurerForbidden(message = "RBAC denied"): ForbiddenException {
  return new ForbiddenException({ code: InsurerErrorCodes.rbacDenied, message });
}

export function insurerNotFound(message = "Insurer not found"): NotFoundException {
  return new NotFoundException({ code: InsurerErrorCodes.notFound, message });
}

export function insurerConflict(message: string): ConflictException {
  return new ConflictException({ code: InsurerErrorCodes.conflict, message });
}

export function insurerInvalid(message: string): BadRequestException {
  return new BadRequestException({ code: InsurerErrorCodes.validationFailed, message });
}
