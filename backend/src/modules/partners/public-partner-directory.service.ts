import type { PublicPartnerDetail, PublicPartnerProduct, PublicPartnerSummary } from "../../../../packages/shared/contracts/public-site.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { PUBLIC_SITE_AUDIT_ACTIONS } from "../audit-logs/public-site-audit-actions";
import type { ActorContext } from "../common/types";
import { InMemoryRedisClient, type RedisClientPort } from "../common/redis/redis.module";
import { CountriesService, type Country } from "../countries/countries.module";
import { PublicJourneyFlagPolicy, type PublicJourneyState } from "../feature-flags/public-journey-flag-policy";
import { PartnerLicensesService, type PartnerLicense } from "../partner-licenses/partner-licenses.module";
import { ProductsService } from "../products/products.module";
import { PartnersService, type PartnerTenant } from "./partners.module";

export interface PublicPartnerDirectoryContext {
  globalFlags?: Partial<Record<string, boolean>> | undefined;
  actor?: ActorContext | undefined;
}

const DEFAULT_GLOBAL_FLAGS: Partial<Record<string, boolean>> = { public_comparator_enabled: true };
const LIST_CACHE_TTL_SECONDS = 60;
const PARTNER_DETAIL_DISCLAIMER =
  "Ce courtier est un partenaire agree d'AssurMatch ; il est seul responsable de la confirmation des devis, garanties et conditions proposees.";

/**
 * A licence covers a partner for its scope only while it has been validated and its expiry date
 * has not yet passed. `PublicStatsService` reuses this exact predicate for its active-broker
 * count so the "eligible licence" rule never drifts between the two public read models.
 */
export function isLicenseCurrentlyValid(license: Pick<PartnerLicense, "status" | "expirationDate">, now: Date = new Date()): boolean {
  return license.status === "valid" && new Date(license.expirationDate) > now;
}

function publicPartnerListCacheKey(isoCode: string): string {
  return `public:partners:${isoCode.toUpperCase()}`;
}

export class PublicPartnerDirectoryService {
  private readonly journeyFlagPolicy = new PublicJourneyFlagPolicy();

  constructor(
    private readonly partners: PartnersService,
    private readonly licenses: PartnerLicensesService,
    private readonly countries: CountriesService,
    private readonly products: ProductsService,
    private readonly cache: RedisClientPort = new InMemoryRedisClient(),
    private readonly audit: AuditLogWriter = new AuditLogWriter()
  ) {}

  async list(countryCode: string, context: PublicPartnerDirectoryContext = {}): Promise<PublicPartnerSummary[]> {
    const { country, globalFlags } = await this.requirePublicCountry(countryCode, context);
    const summaries = await this.loadSummaries(country, globalFlags);
    this.audit.write({
      actor: context.actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.publicPartnerListed,
      targetType: "Country",
      targetId: country.id,
      scope: { countryId: country.id },
      result: "success",
      context: { count: summaries.length }
    });
    return summaries;
  }

  async detail(countryCode: string, partnerId: string, context: PublicPartnerDirectoryContext = {}): Promise<PublicPartnerDetail> {
    const { country, globalFlags } = await this.requirePublicCountry(countryCode, context);
    const summaries = await this.loadSummaries(country, globalFlags);
    const summary = summaries.find((candidate) => candidate.id === partnerId);
    if (!summary) {
      this.audit.write({
        actor: context.actor,
        action: PUBLIC_SITE_AUDIT_ACTIONS.publicPartnerRefused,
        targetType: "PartnerTenant",
        targetId: partnerId,
        scope: { countryId: country.id },
        result: "refused",
        reason: "partner_not_eligible",
        context: {}
      });
      throw new Error("Partner not found");
    }
    const countryProducts = await this.products.listPublicForCountry(country.id, country.flags, globalFlags);
    const nameByKey = new Map(countryProducts.map((product) => [product.key, product.name]));
    const products: PublicPartnerProduct[] = summary.productKeys.map((key) => ({ key, name: nameByKey.get(key) ?? key }));
    this.audit.write({
      actor: context.actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.publicPartnerExposed,
      targetType: "PartnerTenant",
      targetId: summary.id,
      scope: { countryId: country.id, partnerTenantId: summary.id },
      result: "success",
      context: {}
    });
    return { ...summary, products, disclaimer: PARTNER_DETAIL_DISCLAIMER };
  }

  private async requirePublicCountry(
    countryCode: string,
    context: PublicPartnerDirectoryContext
  ): Promise<{ country: Country; globalFlags: Partial<Record<string, boolean>> }> {
    const globalFlags = context.globalFlags ?? DEFAULT_GLOBAL_FLAGS;
    const country = await this.countries.findByIsoCode(countryCode);
    const state: PublicJourneyState | undefined = country
      ? this.journeyFlagPolicy.resolve({ globalFlags, countryFlags: country.flags })
      : undefined;
    if (!country || !state?.publicEnabled) {
      this.audit.write({
        actor: context.actor,
        action: PUBLIC_SITE_AUDIT_ACTIONS.publicPartnerRefused,
        targetType: "Country",
        targetId: country?.id ?? countryCode,
        result: "refused",
        reason: state?.reasons.join(",") ?? "country_not_found",
        context: {}
      });
      throw new Error("Country is not publicly available");
    }
    return { country, globalFlags };
  }

  private async loadSummaries(country: Country, globalFlags: Partial<Record<string, boolean>>): Promise<PublicPartnerSummary[]> {
    const key = publicPartnerListCacheKey(country.isoCode);
    const cached = await this.cache.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as PublicPartnerSummary[];
      } catch {
        // corrupt cache entry: fall through and recompute
      }
    }
    const summaries = await this.computeEligibleSummaries(country, globalFlags);
    await this.cache.set(key, JSON.stringify(summaries), LIST_CACHE_TTL_SECONDS);
    return summaries;
  }

  private async computeEligibleSummaries(country: Country, globalFlags: Partial<Record<string, boolean>>): Promise<PublicPartnerSummary[]> {
    const countryProducts = await this.products.listPublicForCountry(country.id, country.flags, globalFlags);
    const productByKey = new Map<string, string>(
      countryProducts.filter((product): product is typeof product & { id: string } => Boolean(product.id)).map((product) => [product.id, product.key])
    );
    const countryProductIds = new Set(productByKey.keys());

    const partnerIds = await this.partners.listActivePartnerIdsForCountry(country.id);
    const summaries: PublicPartnerSummary[] = [];
    for (const partnerId of partnerIds) {
      const partner = await this.loadActivePartner(partnerId);
      if (!partner) continue;
      const license = await this.pickValidLicense(partnerId, country.id);
      if (!license) continue;
      const productKeys = await this.resolveCoveredProductKeys(partnerId, license, countryProductIds, productByKey);
      summaries.push(this.toSummary(partner, license, productKeys));
    }
    return summaries.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  private async loadActivePartner(partnerId: string): Promise<PartnerTenant | undefined> {
    try {
      const partner = await this.partners.require(partnerId);
      return partner.status === "active" ? partner : undefined;
    } catch {
      return undefined;
    }
  }

  private async pickValidLicense(partnerId: string, countryId: string): Promise<PartnerLicense | undefined> {
    const licenses = await this.licenses.listForPartner(partnerId);
    const valid = licenses.filter((license) => license.countryId === countryId && isLicenseCurrentlyValid(license));
    if (valid.length === 0) return undefined;
    return [...valid].sort((a, b) => b.expirationDate.localeCompare(a.expirationDate))[0];
  }

  private async resolveCoveredProductKeys(
    partnerId: string,
    license: PartnerLicense,
    countryProductIds: Set<string>,
    productKeyById: Map<string, string>
  ): Promise<string[]> {
    const partnerProductIds = new Set(await this.partners.listActiveProductIdsForPartner(partnerId));
    let coveredIds = [...countryProductIds].filter((id) => partnerProductIds.has(id));
    if (license.productIds.length > 0) {
      const licenseScope = new Set(license.productIds);
      coveredIds = coveredIds.filter((id) => licenseScope.has(id));
    }
    return coveredIds
      .map((id) => productKeyById.get(id))
      .filter((key): key is string => Boolean(key))
      .sort((a, b) => a.localeCompare(b));
  }

  private toSummary(partner: PartnerTenant, license: PartnerLicense, productKeys: string[]): PublicPartnerSummary {
    return {
      id: partner.id,
      displayName: partner.tradeName ?? partner.legalName,
      city: partner.city ?? null,
      licenseNumber: license.licenseNumber,
      issuingAuthority: license.issuingAuthority,
      licenseExpiresAt: license.expirationDate,
      productKeys
    };
  }
}
