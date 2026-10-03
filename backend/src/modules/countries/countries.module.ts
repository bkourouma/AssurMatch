import { countryCreateSchema, countryUpdateSchema, COUNTRY_FEATURE_FLAG_DEFAULTS, COUNTRY_STATUS_TRANSITIONS, type CountryDto, type CountryFlags, type CountryRecord, type CountryStatus, type CountryUpdateDto } from "../../../../packages/shared/contracts/catalog.contracts";
import type { CountryPageResponse } from "../../../../packages/shared/contracts/quote.contracts";
import { pickDefined } from "../../../../packages/shared/validation/patch.schemas";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import { assertFreshVersion, catalogConflict, catalogUnprocessable } from "../catalog/catalog-errors";
import type { ActorContext } from "../common/types";
import { PublicJourneyFlagPolicy } from "../feature-flags/public-journey-flag-policy";
import { MemoryCountriesRepository, type CountriesRepository } from "./countries.repository";

export interface Country extends Omit<CountryRecord, "id" | "flags"> {
  id: string;
  flags: CountryFlags;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
  /** Spec 046: set once, on the first transition to `public`; anchors the waiting-list retention. */
  publicSince?: Date | null;
}

/** Spec 050 R9: what the countries module needs to know about a referenced regime. */
export interface CountryRegimeLookup {
  find(id: string): Promise<{ id: string; status: string } | undefined>;
}


/**
 * Spec 050 FR-005 / US1-4: flags as the public journey must read them. A suspended or retired
 * country keeps its stored flags (so it can be reopened as it was) but exposes nothing except the
 * waiting list: no comparison, no quote form, no new request.
 */
export function publicCountryFlags(country: Pick<Country, "status" | "flags">): CountryFlags {
  if (country.status !== "suspended" && country.status !== "retired") return country.flags;
  return {
    ...COUNTRY_FEATURE_FLAG_DEFAULTS,
    country_waitlist_enabled: country.status === "suspended" && country.flags.country_waitlist_enabled === true
  };
}

export function isCountryStatusTransitionAllowed(from: CountryStatus, to: CountryStatus): boolean {
  return from === to || COUNTRY_STATUS_TRANSITIONS[from].includes(to);
}

export class CountriesService {
  constructor(
    private readonly audit: AuditLogWriter,
    private readonly repository: CountriesRepository = new MemoryCountriesRepository(),
    private readonly regimes?: CountryRegimeLookup
  ) {}

  async create(input: CountryDto, actor: ActorContext, reason?: string): Promise<Country> {
    const parsed = countryCreateSchema.parse(input);
    const now = new Date();
    const country: Country = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      flags: { ...COUNTRY_FEATURE_FLAG_DEFAULTS, ...parsed.flags },
      ...(parsed.status === "public" ? { publicSince: now } : {}),
      createdAt: now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    };
    await this.repository.create(country);
    this.audit.write({
      actor,
      action: "country.created",
      targetType: "Country",
      targetId: country.id,
      scope: { countryId: country.id },
      result: "success",
      ...(reason ? { reason } : {}),
      context: { isoCode: country.isoCode, status: country.status, after: this.snapshot(country) }
    });
    return country;
  }

  async update(id: string, input: CountryUpdateDto, actor: ActorContext): Promise<Country> {
    const { reason, flags, expectedUpdatedAt, ...changes } = countryUpdateSchema.parse(input);
    const country = await this.require(id);
    try {
      assertFreshVersion(expectedUpdatedAt, country.updatedAt);
    } catch (error) {
      this.refuse(actor, country.id, "stale_version", reason);
      throw error;
    }
    if (changes.regulatoryRegimeId && changes.regulatoryRegimeId !== country.regulatoryRegimeId && this.regimes) {
      const regime = await this.regimes.find(changes.regulatoryRegimeId);
      if (!regime || regime.status === "retired") {
        this.refuse(actor, country.id, regime ? "regime_retired" : "regime_not_found", reason);
        throw catalogUnprocessable("REGULATORY_REGIME_INVALID", "Regulatory regime must exist and not be retired");
      }
    }
    const before = this.snapshot(country);
    const nextFlags: CountryFlags = { ...country.flags, ...pickDefined(flags) };
    const nextRegimeId = changes.regulatoryRegimeId ?? country.regulatoryRegimeId;
    if (changes.status === "public" && (!nextRegimeId || !nextFlags.country_public_enabled)) {
      throw new Error("Country public activation requires regime and country_public_enabled");
    }
    const now = new Date();
    // Spec 046 FR-009: only the first opening is recorded; a later suspension and reopening keeps it.
    const firstOpening = changes.status === "public" && !country.publicSince;
    Object.assign(country, pickDefined(changes), {
      flags: nextFlags,
      ...(firstOpening ? { publicSince: now } : {}),
      updatedAt: now
    });
    await this.repository.update(id, country);
    this.audit.write({
      actor,
      action: "country.updated",
      targetType: "Country",
      targetId: country.id,
      scope: { countryId: country.id },
      result: "success",
      reason,
      context: { status: country.status, flags: country.flags, before, after: this.snapshot(country) }
    });
    return country;
  }

  /**
   * Spec 050: status change from the admin catalogue. Activation conditions (R4) are checked by the
   * catalogue layer before this call; this only enforces the transition graph and the stored flag.
   */
  async changeStatus(id: string, status: CountryStatus, reason: string, actor: ActorContext): Promise<Country> {
    const country = await this.require(id);
    const previous = country.status;
    if (!isCountryStatusTransitionAllowed(previous, status)) {
      this.refuse(actor, country.id, `invalid_transition:${previous}->${status}`, reason, "country.status_change_refused");
      throw catalogConflict(`Country status transition ${previous} -> ${status} is not allowed`, "CONFLICT");
    }
    if (previous === status) return country;
    if (status === "public" && (!country.regulatoryRegimeId || !country.flags.country_public_enabled)) {
      this.refuse(actor, country.id, "public_requires_regime_and_flag", reason, "country.status_change_refused");
      throw catalogUnprocessable("ACTIVATION_BLOCKED", "Country public activation requires regime and country_public_enabled");
    }
    const now = new Date();
    const firstOpening = status === "public" && !country.publicSince;
    const updated = await this.repository.update(id, { status, ...(firstOpening ? { publicSince: now } : {}), updatedAt: now });
    this.audit.write({
      actor,
      action: "country.status_changed",
      targetType: "Country",
      targetId: country.id,
      scope: { countryId: country.id },
      result: "success",
      reason,
      context: { before: { status: previous }, after: { status } }
    });
    return updated;
  }

  /**
   * Spec 050 R1: writes one flag into the JSON read by the public journey. The catalogue flag
   * service owns the conditions, the FeatureFlag history and the audit entry of the toggle.
   */
  async writeFlag(id: string, key: keyof CountryFlags, value: boolean): Promise<Country> {
    const country = await this.require(id);
    return this.repository.update(id, { flags: { ...country.flags, [key]: value }, updatedAt: new Date() });
  }

  listAdmin(): Promise<Country[]> {
    return this.repository.list();
  }

  listPublic(): Promise<Country[]> {
    return this.repository.listPublic();
  }

  async getPublicPage(countryCode: string, globalFlags: Partial<Record<string, boolean>> = { public_comparator_enabled: true }, actor?: ActorContext): Promise<CountryPageResponse> {
    const country = await this.repository.findByIsoCode(countryCode);
    const policy = new PublicJourneyFlagPolicy();
    if (!country) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.publicJourneyFlagBlocked,
        targetType: "Country",
        targetId: countryCode,
        result: "refused",
        reason: "country_not_found",
        context: {}
      });
      throw new Error("Country is not publicly available");
    }
    const journeyState = policy.resolve({ globalFlags, countryFlags: country.flags });
    if (country.status !== "public" || !journeyState.publicEnabled) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.publicJourneyFlagBlocked,
        targetType: "Country",
        targetId: country.id,
        scope: { countryId: country.id },
        result: "refused",
        reason: journeyState.reasons.join(","),
        context: { status: country.status }
      });
      throw new Error("Country is not publicly available");
    }
    this.audit.write({
      actor,
      action: QuoteAuditActions.publicCountryExposed,
      targetType: "Country",
      targetId: country.id,
      scope: { countryId: country.id },
      result: "success",
      context: { isoCode: country.isoCode }
    });
    return {
      id: country.id,
      isoCode: country.isoCode,
      name: country.name,
      journeyState,
      technicalRoleNotice: "AssurMatch est une plateforme technique de comparaison indicative et de mise en relation avec des courtiers partenaires."
    };
  }

  findByIsoCode(countryCode: string): Promise<Country | undefined> {
    return this.repository.findByIsoCode(countryCode);
  }

  require(id: string): Promise<Country> {
    return this.repository.require(id);
  }

  private snapshot(country: Country): Record<string, unknown> {
    return {
      name: country.name,
      currency: country.currency,
      languages: country.languages,
      timezone: country.timezone,
      regulatoryFamily: country.regulatoryFamily,
      regulatoryRegimeId: country.regulatoryRegimeId,
      phoneDialCode: country.phoneDialCode,
      phoneNationalLengths: country.phoneNationalLengths,
      status: country.status,
      flags: { ...country.flags }
    };
  }

  private refuse(actor: ActorContext, countryId: string, refusal: string, requestReason?: string, action = "country.update_refused"): void {
    this.audit.write({
      actor,
      action,
      targetType: "Country",
      targetId: countryId,
      scope: { countryId },
      result: "refused",
      reason: refusal,
      context: { requestReason }
    });
  }
}

export class CountriesModule {
  readonly service: CountriesService;

  constructor(audit = new AuditLogWriter(), repository?: CountriesRepository, regimes?: CountryRegimeLookup) {
    this.service = new CountriesService(audit, repository, regimes);
  }
}

export { COUNTRIES_REPOSITORY, MemoryCountriesRepository, type CountriesRepository } from "./countries.repository";
export { PublicCountryDirectoryService, type PublicCountryDirectoryContext } from "./public-country-directory.service";
