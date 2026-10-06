import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { PartnerActivationBlocker } from "../../../../packages/shared/contracts/partner.contracts";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";

/**
 * Spec 051: partner onboarding refusals carry an explicit `code` (same format as spec 050), so the
 * HTTP status and error code never depend on the wording of a message.
 */
export const PartnerErrorCodes = {
  rbacDenied: ErrorCodes.RBAC_DENIED,
  notFound: ErrorCodes.NOT_FOUND,
  activationBlocked: ErrorCodes.PARTNER_ACTIVATION_BLOCKED,
  transitionInvalid: ErrorCodes.PARTNER_TRANSITION_INVALID,
  duplicateRegistration: ErrorCodes.PARTNER_DUPLICATE_REGISTRATION,
  updateConflict: ErrorCodes.PARTNER_UPDATE_CONFLICT,
  partnerRetired: ErrorCodes.PARTNER_RETIRED,
  licenseDocumentRequired: ErrorCodes.LICENSE_DOCUMENT_REQUIRED,
  licenseExpired: ErrorCodes.LICENSE_EXPIRED,
  licenseTransitionInvalid: ErrorCodes.LICENSE_TRANSITION_INVALID,
  licenseRequiredForCountry: ErrorCodes.LICENSE_REQUIRED_FOR_COUNTRY,
  documentQuarantined: ErrorCodes.DOCUMENT_QUARANTINED,
  documentInvalid: ErrorCodes.DOCUMENT_INVALID,
  storageNotConfigured: ErrorCodes.DOCUMENT_STORAGE_NOT_CONFIGURED,
  contractDocumentInvalid: ErrorCodes.CONTRACT_DOCUMENT_INVALID,
  validationFailed: ErrorCodes.VALIDATION_FAILED,
  conflict: ErrorCodes.CONFLICT
} as const;

export function partnerForbidden(message = "RBAC denied", code: string = PartnerErrorCodes.rbacDenied): ForbiddenException {
  return new ForbiddenException({ code, message });
}

export function partnerConflict(message: string, code: string = PartnerErrorCodes.conflict): ConflictException {
  return new ConflictException({ code, message });
}

export function partnerNotFound(message: string): NotFoundException {
  return new NotFoundException({ code: PartnerErrorCodes.notFound, message });
}

export function partnerUnprocessable(code: string, message: string, blockers: PartnerActivationBlocker[] = []): UnprocessableEntityException {
  return new UnprocessableEntityException({ code, message, ...(blockers.length ? { blockers } : {}) });
}
