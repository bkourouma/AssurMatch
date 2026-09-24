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
  // URL.hostname keeps the brackets around an IPv6 literal, which isIP() does not accept.
  const literal = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (isIP(literal)) assertPublicAddress(literal);
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
  const hextets = parseIpv6Hextets(address);
  if (!hextets) throw new Error("Invalid webhook endpoint URL cannot target internal hosts");
  const [h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0, h6 = 0, h7 = 0] = hextets;

  // Addresses that embed an IPv4 target are only as public as that IPv4 address.
  const leadingZero = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0;
  if (leadingZero && (h5 === 0xffff || h5 === 0)) {
    // ::ffff:a.b.c.d (IPv4-mapped) and ::a.b.c.d (IPv4-compatible), plus :: and ::1.
    if (h6 === 0 && h7 <= 1) throw new Error("Invalid webhook endpoint URL cannot target internal hosts");
    assertPublicIpv4(embeddedIpv4(h6, h7));
    return;
  }
  if (h0 === 0x0064 && h1 === 0xff9b) {
    // 64:ff9b::/96 and 64:ff9b:1::/48 NAT64 translation prefixes.
    assertPublicIpv4(embeddedIpv4(h6, h7));
    return;
  }
  if (h0 === 0x2002) {
    // 2002::/16 6to4 encodes the IPv4 address in the next two hextets.
    assertPublicIpv4(embeddedIpv4(h1, h2));
    return;
  }

  const blocked =
    (h0 & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (h0 & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (h0 & 0xff00) === 0xff00 || // ff00::/8 multicast
    (h0 === 0x2001 && h1 === 0x0db8) || // 2001:db8::/32 documentation
    (h0 === 0x2001 && h1 === 0x0000) || // 2001::/32 Teredo tunnels an arbitrary IPv4 target
    (h0 === 0x0100 && h1 === 0x0000); // 100::/64 discard-only
  if (blocked) throw new Error("Invalid webhook endpoint URL cannot target internal hosts");
}

function embeddedIpv4(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function parseIpv6Hextets(address: string): number[] | undefined {
  // Drop any zone index ("fe80::1%eth0") before parsing.
  const [base = ""] = address.toLowerCase().split("%");
  const [head = "", tail, ...extra] = base.split("::");
  if (extra.length > 0) return undefined;

  const toHextets = (part: string): number[] | undefined => {
    if (part === "") return [];
    const groups: number[] = [];
    for (const piece of part.split(":")) {
      if (piece.includes(".")) {
        const octets = piece.split(".").map(Number);
        if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return undefined;
        const [a = 0, b = 0, c = 0, d = 0] = octets;
        groups.push((a << 8) | b, (c << 8) | d);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(piece)) return undefined;
      groups.push(Number.parseInt(piece, 16));
    }
    return groups;
  };

  const left = toHextets(head);
  const right = tail === undefined ? [] : toHextets(tail);
  if (!left || !right) return undefined;
  if (tail === undefined) return left.length === 8 ? left : undefined;
  const gap = 8 - left.length - right.length;
  if (gap < 1) return undefined;
  return [...left, ...Array<number>(gap).fill(0), ...right];
}
