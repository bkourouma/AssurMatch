import { describe, expect, it } from "vitest";
import { assertWebhookDnsPublic, assertWebhookUrlShape, type WebhookDnsResolver } from "../../../src/modules/partner-integrations/webhook-url-policy";

function resolverFor(address: string, family: 4 | 6): WebhookDnsResolver {
  return { lookup: async () => [{ address, family }] };
}

const INTERNAL_IPV6 = [
  // IPv4-mapped and IPv4-compatible forms wrap an internal IPv4 target.
  "::ffff:169.254.169.254",
  "::ffff:127.0.0.1",
  "::ffff:10.0.0.5",
  "::ffff:192.168.1.1",
  // NAT64 and 6to4 embed the target in different positions.
  "64:ff9b::7f00:1",
  "2002:7f00:1::",
  // fe80::/10 spans fe80-febf, not just the literal fe80 prefix.
  "fe81::1",
  "febf::1",
  "fe80::1",
  "fc00::1",
  "fd12:3456::1",
  "::1",
  "::",
  "ff02::1",
  "2001:db8::1"
];

describe("webhook URL policy", () => {
  it("rejects DNS answers that resolve to internal IPv6 targets", async () => {
    for (const address of INTERNAL_IPV6) {
      await expect(
        assertWebhookDnsPublic(new URL("https://hooks.partner.example/x"), resolverFor(address, 6)),
        address
      ).rejects.toThrow(/internal hosts/);
    }
  });

  it("accepts DNS answers that resolve to genuinely public addresses", async () => {
    for (const address of ["2a00:1450:4001:80e::200e", "2001:4860:4860::8888", "::ffff:8.8.8.8"]) {
      await expect(
        assertWebhookDnsPublic(new URL("https://hooks.partner.example/x"), resolverFor(address, 6)),
        address
      ).resolves.toBeUndefined();
    }
    await expect(assertWebhookDnsPublic(new URL("https://hooks.partner.example/x"), resolverFor("93.184.216.34", 4))).resolves.toBeUndefined();
  });

  it("rejects IPv6 literals in the URL itself, which carry brackets in URL.hostname", () => {
    expect(() => assertWebhookUrlShape("https://[::1]/hooks")).toThrow(/internal hosts/);
    expect(() => assertWebhookUrlShape("https://[::ffff:169.254.169.254]/hooks")).toThrow(/internal hosts/);
    expect(() => assertWebhookUrlShape("https://[fe81::1]/hooks")).toThrow(/internal hosts/);
  });

  it("keeps rejecting the existing IPv4, scheme and credential cases", () => {
    expect(() => assertWebhookUrlShape("https://127.0.0.1/hooks")).toThrow(/internal hosts/);
    expect(() => assertWebhookUrlShape("https://169.254.169.254/hooks")).toThrow(/internal hosts/);
    expect(() => assertWebhookUrlShape("http://hooks.partner.example/x")).toThrow(/HTTPS/);
    expect(() => assertWebhookUrlShape("https://user:pass@hooks.partner.example/x")).toThrow(/credentials/);
    expect(() => assertWebhookUrlShape("https://localhost/hooks")).toThrow(/internal hosts/);
    expect(assertWebhookUrlShape("https://hooks.partner.example/assurmatch").pathname).toBe("/assurmatch");
  });
});
