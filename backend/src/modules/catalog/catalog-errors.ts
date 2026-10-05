import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { CatalogActivationBlocker } from "../../../../packages/shared/contracts/catalog.contracts";

/**
 * Spec 050 R11: catalogue refusals are explicit Nest exceptions carrying a stable `code`, so the
 * HTTP status and the error code never depend on the wording of a message.
 */
export const CatalogErrorCodes = {
  flagNotToggleable: "CATALOG_FLAG_NOT_TOGGLEABLE",
  activationBlocked: "ACTIVATION_BLOCKED",
  quoteFormRequired: "QUOTE_FORM_REQUIRED",
  consentTextRequired: "CONSENT_TEXT_REQUIRED",
  updateConflict: "CATALOG_UPDATE_CONFLICT",
  rbacDenied: "RBAC_DENIED",
  notFound: "NOT_FOUND",
  invalidTransition: "VALIDATION_FAILED"
} as const;

export function catalogForbidden(message: string, code: string = CatalogErrorCodes.rbacDenied): ForbiddenException {
  return new ForbiddenException({ code, message });
}

export function catalogConflict(message: string, code: string = CatalogErrorCodes.updateConflict): ConflictException {
  return new ConflictException({ code, message });
}

export function catalogNotFound(message: string): NotFoundException {
  return new NotFoundException({ code: CatalogErrorCodes.notFound, message });
}

export function catalogUnprocessable(code: string, message: string, blockers: CatalogActivationBlocker[] = []): UnprocessableEntityException {
  return new UnprocessableEntityException({ code, message, blockers });
}

/** R10: refuses a write whose `expectedUpdatedAt` no longer matches the stored record. */
export function assertFreshVersion(expectedUpdatedAt: string | undefined, current: Date | string): void {
  if (!expectedUpdatedAt) return;
  const stored = current instanceof Date ? current.getTime() : new Date(current).getTime();
  if (new Date(expectedUpdatedAt).getTime() !== stored) {
    throw catalogConflict("Catalog update conflict: the record changed since it was loaded; reload and retry");
  }
}
