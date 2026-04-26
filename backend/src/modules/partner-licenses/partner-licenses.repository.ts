import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PartnerLicense } from "./partner-licenses.module";

export const PARTNER_LICENSES_REPOSITORY = Symbol("PARTNER_LICENSES_REPOSITORY");

export interface PartnerLicensesRepository extends RuntimeRepository {
  create(license: PartnerLicense): PartnerLicense;
  update(id: string, update: Partial<PartnerLicense>): PartnerLicense;
  listForPartner(partnerTenantId: string): PartnerLicense[];
  eligible(partnerTenantId: string, countryId: string, productId?: string): boolean;
  require(id: string): PartnerLicense;
}

export class MemoryPartnerLicensesRepository implements PartnerLicensesRepository {
  readonly mode = "memory-test" as const;
  private readonly licenses: PartnerLicense[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "PartnerLicensesRepository");
  }

  create(license: PartnerLicense): PartnerLicense {
    this.licenses.push(license);
    return license;
  }

  update(id: string, update: Partial<PartnerLicense>): PartnerLicense {
    const license = this.require(id);
    Object.assign(license, update);
    return license;
  }

  listForPartner(partnerTenantId: string): PartnerLicense[] {
    return this.licenses.filter((license) => license.partnerTenantId === partnerTenantId);
  }

  eligible(partnerTenantId: string, countryId: string, productId?: string): boolean {
    return this.licenses.some((license) =>
      license.partnerTenantId === partnerTenantId &&
      license.countryId === countryId &&
      license.status === "valid" &&
      new Date(license.expirationDate) > new Date() &&
      (!productId || license.productIds.length === 0 || license.productIds.includes(productId))
    );
  }

  require(id: string): PartnerLicense {
    const license = this.licenses.find((candidate) => candidate.id === id);
    if (!license) throw new Error(`License ${id} not found`);
    return license;
  }
}
