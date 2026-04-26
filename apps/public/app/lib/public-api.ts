const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";

export interface PublicApiState<T> {
  data: T;
  error?: string;
}

async function readPublic<T>(path: string, fallback: T): Promise<PublicApiState<T>> {
  try {
    const response = await fetch(`${PUBLIC_API_BASE_URL}${path}`, { cache: "no-store" });
    if (!response.ok) return { data: fallback, error: `api_${response.status}` };
    return { data: await response.json() as T };
  } catch (error) {
    return { data: fallback, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

export function listPublicCountries() {
  return readPublic<unknown[]>("/countries", []);
}

export function listPublicProducts(countryCode: string) {
  return readPublic<unknown[]>(`/countries/${countryCode}/products`, []);
}

export function listPublicOffers(countryCode: string, productKey: string) {
  return readPublic<unknown[]>(`/countries/${countryCode}/products/${productKey}/offers`, []);
}
