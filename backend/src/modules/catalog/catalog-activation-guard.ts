import type { CatalogActivationBlocker } from "../../../../packages/shared/contracts/catalog.contracts";
import type { ActivationChecklistService } from "../activation-checklist/activation-checklist.service";

/** Controls that describe the very change being requested, so they cannot block it (R4). */
export const COUNTRY_PUBLIC_SELF_CONTROLS = ["country_status_public", "country_public_enabled"] as const;

export interface CatalogActivationGuardDeps {
  checklist: Pick<ActivationChecklistService, "countryActivationBlockers">;
  quoteForms: { list(): Promise<Array<{ countryId: string; productId: string; status: string }>> };
  consentTexts: { listTexts(): Promise<Array<{ countryId: string; productId?: string | undefined; purpose: string; status?: string | undefined }>> };
}

/**
 * Spec 050 R4: conditions for **activating** a catalogue flag or the public status. Deactivation
 * never goes through this guard (FR-005). The country rules reuse the activation checklist instead
 * of re-implementing them, so the two can never disagree.
 */
export class CatalogActivationGuard {
  constructor(private readonly deps: CatalogActivationGuardDeps) {}

  /** `country_public_enabled=true` or status `public`: every blocking checklist control must pass. */
  countryPublicBlockers(countryId: string): Promise<CatalogActivationBlocker[]> {
    return this.deps.checklist.countryActivationBlockers(countryId, [...COUNTRY_PUBLIC_SELF_CONTROLS]);
  }

  /** `country_quote_enabled=true`: at least one linked product has a published quote form. */
  async countryHasPublishedForm(countryId: string, linkedProductIds: string[]): Promise<boolean> {
    const linked = new Set(linkedProductIds);
    return (await this.deps.quoteForms.list()).some((form) => form.countryId === countryId && linked.has(form.productId) && form.status === "published");
  }

  /** `product_quote_enabled=true` on a link: a quote form is published for this country and product (FR-008). */
  async linkHasPublishedForm(countryId: string, productId: string): Promise<boolean> {
    return (await this.deps.quoteForms.list()).some((form) => form.countryId === countryId && form.productId === productId && form.status === "published");
  }

  /**
   * `product_public_enabled=true` on a link: a published `lead_transmission` text exists for this
   * country and this product, or for this country without a product (FR-008).
   */
  async linkHasPublishedConsent(countryId: string, productId: string): Promise<boolean> {
    return (await this.deps.consentTexts.listTexts()).some((text) =>
      text.status === "published"
      && text.purpose === "lead_transmission"
      && text.countryId === countryId
      && (!text.productId || text.productId === productId)
    );
  }
}
