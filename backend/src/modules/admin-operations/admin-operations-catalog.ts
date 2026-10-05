/**
 * Spec 056: read-only lookups shared by the consoles. The `QuoteRequest` table stores ids only (the
 * Prisma repository strips `countryCode` / `productKey` on write), so codes and partner names are
 * resolved from the catalogue once per request instead of per row.
 */
export interface OperationsCatalogPorts {
  countries: { listAdmin(): Promise<Array<{ id: string; isoCode: string }>> };
  products: { listAdmin(): Promise<Array<{ id: string; key: string }>> };
  partners: { list(): Promise<Array<{ id: string; legalName: string }>> };
}

export interface OperationsCatalog {
  countryCode(countryId: string): string | undefined;
  countryId(isoCode: string): string | undefined;
  productKey(productId: string): string | undefined;
  productId(productKey: string): string | undefined;
  partnerName(partnerTenantId: string | undefined | null): string | null;
}

export async function loadOperationsCatalog(ports: OperationsCatalogPorts): Promise<OperationsCatalog> {
  const [countries, products, partners] = await Promise.all([
    ports.countries.listAdmin().catch(() => []),
    ports.products.listAdmin().catch(() => []),
    ports.partners.list().catch(() => [])
  ]);
  const countryById = new Map(countries.map((country) => [country.id, country.isoCode]));
  const countryByCode = new Map(countries.map((country) => [country.isoCode, country.id]));
  const productById = new Map(products.map((product) => [product.id, product.key]));
  const productByKey = new Map(products.map((product) => [product.key, product.id]));
  const partnerById = new Map(partners.map((partner) => [partner.id, partner.legalName]));
  return {
    countryCode: (countryId) => countryById.get(countryId),
    countryId: (isoCode) => countryByCode.get(isoCode),
    productKey: (productId) => productById.get(productId),
    productId: (productKey) => productByKey.get(productKey),
    partnerName: (partnerTenantId) => (partnerTenantId ? partnerById.get(partnerTenantId) ?? null : null)
  };
}
