import { countryCreateSchema, countryUpdateSchema, COUNTRY_FEATURE_FLAG_DEFAULTS, type CountryDto, type CountryFlags, type CountryRecord } from "../../../../packages/shared/contracts/catalog.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";

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
