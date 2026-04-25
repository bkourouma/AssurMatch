import { countryCreateSchema, countryUpdateSchema, COUNTRY_FEATURE_FLAG_DEFAULTS, type CountryDto, type CountryFlags, type CountryRecord } from "../../../../packages/shared/contracts/catalog.contracts";
import type { CountryPageResponse } from "../../../../packages/shared/contracts/quote.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { PublicJourneyFlagPolicy } from "../feature-flags/public-journey-flag-policy";

export interface Country extends Omit<CountryRecord, "id" | "flags"> {
  id: string;
  flags: CountryFlags;
  createdAt: Date;
  updatedAt: Date;
}

export class CountriesService {
  private readonly countries: Country[] = [];

  constructor(private readonly audit: AuditLogWriter) {}

  create(input: CountryDto, actor: ActorContext): Country {
    const parsed = countryCreateSchema.parse(input);
    const now = new Date();
    const country: Country = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      flags: { ...COUNTRY_FEATURE_FLAG_DEFAULTS, ...parsed.flags },
      createdAt: now,
      updatedAt: now
    };
    this.countries.push(country);
    this.audit.write({
      actor,
      action: "country.created",
      targetType: "Country",
      targetId: country.id,
      scope: { countryId: country.id },
      result: "success",
      context: { isoCode: country.isoCode, status: country.status }
    });
    return country;
  }

  update(id: string, input: Partial<CountryDto> & { reason: string }, actor: ActorContext): Country {
    const parsed = countryUpdateSchema.parse(input);
    const country = this.require(id);
    if (parsed.status === "public" && (!country.regulatoryRegimeId || parsed.flags?.country_public_enabled !== true)) {
      throw new Error("Country public activation requires regime and country_public_enabled");
    }
    Object.assign(country, parsed, {
      flags: { ...country.flags, ...(parsed.flags ?? {}) },
      updatedAt: new Date()
    });
    this.audit.write({
      actor,
      action: "country.updated",
      targetType: "Country",
      targetId: country.id,
      scope: { countryId: country.id },
      result: "success",
      reason: parsed.reason,
      context: { status: country.status, flags: country.flags }
    });
    return country;
  }

  listAdmin(): Country[] {
    return [...this.countries];
  }

  listPublic(): Country[] {
    return this.countries.filter((country) =>
      country.status === "public" && (country.flags.country_public_enabled || country.flags.country_waitlist_enabled)
    );
  }

  getPublicPage(countryCode: string, globalFlags: Partial<Record<string, boolean>> = { public_comparator_enabled: true }, actor?: ActorContext): CountryPageResponse {
    const country = this.countries.find((candidate) => candidate.isoCode.toUpperCase() === countryCode.toUpperCase());
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

  findByIsoCode(countryCode: string): Country | undefined {
    return this.countries.find((candidate) => candidate.isoCode.toUpperCase() === countryCode.toUpperCase());
  }

  require(id: string): Country {
    const country = this.countries.find((candidate) => candidate.id === id);
    if (!country) throw new Error(`Country ${id} not found`);
    return country;
  }
}

export class CountriesModule {
  readonly service: CountriesService;

  constructor(audit = new AuditLogWriter()) {
    this.service = new CountriesService(audit);
  }
}
