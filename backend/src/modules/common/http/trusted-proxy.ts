const MAX_TRUSTED_PROXY_HOPS = 5;

/**
 * Number of reverse proxies in front of the API that are trusted to append the address of their
 * peer to `X-Forwarded-For` (spec 057, PRD K-12). Defaults to 1: nginx terminates TLS and proxies to
 * the API. `0` means the API is reached directly and every forwarding header is ignored.
 */
export function trustedProxyHops(env: Record<string, string | undefined> = process.env): number {
  const raw = env.TRUSTED_PROXY_HOPS?.trim();
  if (raw === undefined || raw === "") return 1;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > MAX_TRUSTED_PROXY_HOPS) {
    throw new Error(`TRUSTED_PROXY_HOPS must be an integer between 0 and ${MAX_TRUSTED_PROXY_HOPS}`);
  }
  return value;
}
