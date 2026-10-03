import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import type { OfferBlocker } from "../../../../packages/shared/contracts/offer-content";

/**
 * Spec 052: offer refusals carry an explicit `code` (same format as specs 050/051), so the HTTP
 * status and error code never depend on the wording of a message.
 */
export const OfferErrorCodes = {
  rbacDenied: ErrorCodes.RBAC_DENIED,
  notFound: ErrorCodes.NOT_FOUND,
  validationFailed: ErrorCodes.VALIDATION_FAILED,
  scopeNotCovered: ErrorCodes.OFFER_SCOPE_NOT_COVERED,
  incomplete: ErrorCodes.OFFER_INCOMPLETE,
  validationBlocked: ErrorCodes.OFFER_VALIDATION_BLOCKED,
  versionConflict: ErrorCodes.OFFER_VERSION_CONFLICT,
  transitionInvalid: ErrorCodes.OFFER_TRANSITION_INVALID
} as const;

export function offerForbidden(message = "RBAC denied", code: string = OfferErrorCodes.rbacDenied): ForbiddenException {
  return new ForbiddenException({ code, message });
}

/** A broker reading or writing another broker's offer gets the same answer as for a missing one (FR-008). */
export function offerNotFound(message = "Offer not found"): NotFoundException {
  return new NotFoundException({ code: OfferErrorCodes.notFound, message });
}

export function offerConflict(message: string, code: string = OfferErrorCodes.transitionInvalid): ConflictException {
  return new ConflictException({ code, message });
}

export function offerUnprocessable(code: string, message: string, blockers: OfferBlocker[] = []): UnprocessableEntityException {
  return new UnprocessableEntityException({ code, message, ...(blockers.length ? { blockers } : {}) });
}

export function offerInvalid(message: string): BadRequestException {
  return new BadRequestException({ code: OfferErrorCodes.validationFailed, message });
}
