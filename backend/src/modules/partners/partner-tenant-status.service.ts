import { ForbiddenException } from "@nestjs/common";
import type { PartnerStatus } from "../../../../packages/shared/contracts/partner.contracts";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import type { ActorContext } from "../common/types";

/** Short enough that a missed invalidation (another API instance) heals quickly. */
export const PARTNER_TENANT_STATUS_TTL_MS = 30_000;

export interface PartnerTenantStatusSource {
  find(id: string): Promise<{ status: PartnerStatus } | undefined>;
  onChange(listener: (partnerTenantId: string) => void | Promise<void>): void;
}

/** What the HTTP guard and the login need; implemented by `PartnerTenantStatusService`. */
export interface PartnerTenantStatusPort {
  status(partnerTenantId: string): Promise<PartnerStatus | undefined>;
}

/**
 * Spec 051 R12: the status of the partner an actor belongs to, read on every protected request.
 * Cached per tenant with a short TTL; every status, identity or coverage change of a partner
 * (`PartnersService.onChange`) drops its entry, so a suspension or a retirement applies to the next
 * request on this instance. An unknown tenant id resolves to `undefined` (no restriction).
 */
export class PartnerTenantStatusService implements PartnerTenantStatusPort {
  private readonly cache = new Map<string, { status: PartnerStatus | undefined; expiresAt: number }>();

  constructor(private readonly partners: PartnerTenantStatusSource, private readonly ttlMs = PARTNER_TENANT_STATUS_TTL_MS, private readonly now: () => number = Date.now) {
    partners.onChange((partnerTenantId) => {
      this.cache.delete(partnerTenantId);
    });
  }

  async status(partnerTenantId: string): Promise<PartnerStatus | undefined> {
    const cached = this.cache.get(partnerTenantId);
    if (cached && cached.expiresAt > this.now()) return cached.status;
    const partner = await this.partners.find(partnerTenantId).catch(() => undefined);
    const status = partner?.status;
    this.cache.set(partnerTenantId, { status, expiresAt: this.now() + this.ttlMs });
    return status;
  }

  invalidate(partnerTenantId?: string): void {
    if (partnerTenantId) this.cache.delete(partnerTenantId);
    else this.cache.clear();
  }
}

/**
 * Spec 051 FR-021: the single guard of every broker write route. A user of a suspended partner keeps
 * read access only; the refusal is a 403 with the `PARTNER_SUSPENDED` code. The actor is marked
 * `tenantReadOnly` by `AuthRequiredHttpGuard`.
 */
export function assertBrokerTenantWritable(actor: ActorContext): void {
  if (actor.tenantReadOnly) {
    throw new ForbiddenException({ code: ErrorCodes.PARTNER_SUSPENDED, message: "Partner account suspended: read-only access" });
  }
}
