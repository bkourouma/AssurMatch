import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface WebhookDnsResolver {
  lookup(hostname: string): Promise<Array<{ address: string; family: 4 | 6 }>>;
}

export const nodeWebhookDnsResolver: WebhookDnsResolver = {
  async lookup(hostname: string) {
    const results = await lookup(hostname, { all: true });
    return results.map((result) => ({ address: result.address, family: result.family === 6 ? 6 : 4 }));
  }
};

export function assertWebhookUrlShape(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Invalid webhook endpoint URL must use HTTPS");
  if (url.username || url.password) throw new Error("Invalid webhook endpoint URL must not contain credentials");
  if (url.search || url.hash) throw new Error("Invalid webhook endpoint URL must not contain query or fragment");
  assertPublicHostname(url.hostname);
  return url;
}

export async function assertWebhookDnsPublic(url: URL, resolver: WebhookDnsResolver): Promise<void> {
  const records = await resolver.lookup(url.hostname);
  if (records.length === 0) throw new Error("Invalid webhook endpoint DNS resolution failed");
  for (const record of records) assertPublicAddress(record.address);
}

function assertPublicHostname(hostname: string): void {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal") {
    throw new Error("Invalid webhook endpoint URL cannot target internal hosts");
  }
  if (isIP(host)) assertPublicAddress(host);
}

function assertPublicAddress(address: string): void {
  if (isIP(address) === 4) assertPublicIpv4(address);
  if (isIP(address) === 6) assertPublicIpv6(address);
}

function assertPublicIpv4(address: string): void {
  const [a = 0, b = 0, c = 0, d = 0] = address.split(".").map(Number);
  const blocked =
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 ||
    (a === 255 && b === 255 && c === 255 && d === 255);
  if (blocked) throw new Error("Invalid webhook endpoint URL cannot target internal hosts");
}

function assertPublicIpv6(address: string): void {
  const normalized = address.toLowerCase();
  const blocked =
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8");
  if (blocked) throw new Error("Invalid webhook endpoint URL cannot target internal hosts");
}
