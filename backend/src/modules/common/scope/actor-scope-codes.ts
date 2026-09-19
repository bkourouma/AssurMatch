/**
 * Actor country/product scopes are stored as catalog ids (see `userCreateSchema.scopes`,
 * whose entries are uuids), while the dashboard, billing and activation policies compare
 * them to ISO country codes and product keys. Resolve ids through the catalog and pass
 * through entries that already are codes, so scopes provisioned either way — through the
 * admin users API or seeded directly — resolve to the same set. Entries that match neither
 * are kept verbatim, which fails closed: they match no catalog entry downstream.
 */
export function resolveScopeCodes(scopes: readonly string[] | undefined, catalog: ReadonlyArray<{ id: string; code: string }>): string[] {
  if (!scopes?.length) return [];
  const codeById = new Map(catalog.map((entry) => [entry.id, entry.code]));
  return [...new Set(scopes.map((scope) => codeById.get(scope) ?? scope))];
}

export function countryCatalog(countries: ReadonlyArray<{ id: string; isoCode: string }>): Array<{ id: string; code: string }> {
  return countries.map((country) => ({ id: country.id, code: country.isoCode }));
}

export function productCatalog(products: ReadonlyArray<{ id: string; key: string }>): Array<{ id: string; code: string }> {
  return products.map((product) => ({ id: product.id, code: product.key }));
}
