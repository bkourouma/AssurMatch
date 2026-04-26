import { countryCreateSchema, countryUpdateSchema, COUNTRY_FEATURE_FLAG_DEFAULTS, type CountryDto, type CountryFlags, type CountryRecord } from "../../../../packages/shared/contracts/catalog.contracts";
import type { CountryPageResponse } from "../../../../packages/shared/contracts/quote.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { PublicJourneyFlagPolicy } from "../feature-flags/public-journey-flag-policy";
import { MemoryCountriesRepository, type CountriesRepository } from "./countries.repository";

export interface Country extends Omit<CountryRecord, "id" | "flags"> {
  id: string;
  flags: CountryFlags;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

export class CountriesService {
  constructor(private readonly audit: AuditLogWriter, private readonly repository: CountriesRepository = new MemoryCountriesRepository()) {}

  async create(input: CountryDto, actor: ActorContext): Promise<Country> {
    const parsed = countryCreateSchema.parse(input);
    const now = new Date();
    const country: Country = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      flags: { ...COUNTRY_FEATURE_FLAG_DEFAULTS, ...parsed.flags },
      createdAt: now,
      updatedAt: now
    };
    await this.repository.create(country);
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

  async update(id: string, input: Partial<CountryDto> & { reason: string }, actor: ActorContext): Promise<Country> {
    const parsed = countryUpdateSchema.parse(input);
    const country = await this.require(id);
    if (parsed.status === "public" && (!country.regulatoryRegimeId || parsed.flags?.country_public_enabled !== true)) {
      throw new Error("Country public activation requires regime and country_public_enabled");
    }
    Object.assign(country, parsed, {
      flags: { ...country.flags, ...(parsed.flags ?? {}) },
      updatedAt: new Date()
    });
    await this.repository.update(id, country);
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
}

export class CountriesModule {
  readonly service: CountriesService;

  constructor(audit = new AuditLogWriter(), repository?: CountriesRepository) {
    this.service = new CountriesService(audit, repository);
  }
}

export { COUNTRIES_REPOSITORY, MemoryCountriesRepository, type CountriesRepository } from "./countries.repository";
