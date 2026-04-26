import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PartnerTenant } from "./partners.module";

export const PARTNERS_REPOSITORY = Symbol("PARTNERS_REPOSITORY");

export interface PartnersRepository extends RuntimeRepository {
  create(partner: PartnerTenant): PartnerTenant;
  update(id: string, update: Partial<PartnerTenant>): PartnerTenant;
  require(id: string): PartnerTenant;
  list(): PartnerTenant[];
  authorizeCountry(partnerTenantId: string, countryId: string): void;
  authorizeProduct(partnerTenantId: string, productId: string): void;
  isAuthorizedForCountry(partnerTenantId: string, countryId: string): boolean;
  isAuthorizedForProduct(partnerTenantId: string, productId: string): boolean;
}

export class MemoryPartnersRepository implements PartnersRepository {
  readonly mode = "memory-test" as const;
  private readonly partners: PartnerTenant[] = [];
  private readonly countryAuthorizations = new Map<string, Set<string>>();
  private readonly productAuthorizations = new Map<string, Set<string>>();

  constructor() {
    assertRuntimeRepository(this.mode, "PartnersRepository");
  }

  create(partner: PartnerTenant): PartnerTenant {
    this.partners.push(partner);
    return partner;
  }

  update(id: string, update: Partial<PartnerTenant>): PartnerTenant {
    const partner = this.require(id);
    Object.assign(partner, update);
    return partner;
  }

  require(id: string): PartnerTenant {
    const partner = this.partners.find((candidate) => candidate.id === id);
    if (!partner) throw new Error(`Partner ${id} not found`);
    return partner;
  }

  list(): PartnerTenant[] {
    return [...this.partners];
  }

  authorizeCountry(partnerTenantId: string, countryId: string): void {
    this.require(partnerTenantId);
    const scopes = this.countryAuthorizations.get(partnerTenantId) ?? new Set<string>();
    scopes.add(countryId);
    this.countryAuthorizations.set(partnerTenantId, scopes);
  }

  authorizeProduct(partnerTenantId: string, productId: string): void {
    this.require(partnerTenantId);
    const scopes = this.productAuthorizations.get(partnerTenantId) ?? new Set<string>();
    scopes.add(productId);
    this.productAuthorizations.set(partnerTenantId, scopes);
  }

  isAuthorizedForCountry(partnerTenantId: string, countryId: string): boolean {
    return this.countryAuthorizations.get(partnerTenantId)?.has(countryId) === true;
  }

  isAuthorizedForProduct(partnerTenantId: string, productId: string): boolean {
    return this.productAuthorizations.get(partnerTenantId)?.has(productId) === true;
  }
}
