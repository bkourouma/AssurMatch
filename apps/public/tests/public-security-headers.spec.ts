import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { securityHeadersFromEnv } from "../../../packages/shared/security/security-headers";

// Spec 058 FR-007: security headers on every public path, without breaking the spec 054 R8 rules
// (visitor token pages: `Referrer-Policy: no-referrer` + `X-Robots-Tag: noindex, nofollow`).
const REQUIRED = ["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy"];
const config = readFileSync("apps/public/next.config.ts", "utf8");

test("public next.config applies the shared headers to every path, before the visitor token rules", () => {
  expect(config).toContain('import { securityHeadersFromEnv } from "../../packages/shared/security/security-headers"');
  const general = config.indexOf('source: "/:path*"');
  const visitor = config.indexOf("...VISITOR_TOKEN_PATHS.map");
  expect(general).toBeGreaterThan(0);
  // Next keeps the LAST value for the same key: the no-referrer rules must come after.
  expect(visitor).toBeGreaterThan(general);
  expect(config).toContain('{ key: "Referrer-Policy", value: "no-referrer" }');
  expect(config).toContain('{ key: "X-Robots-Tag", value: "noindex, nofollow" }');
  expect(config).toContain("poweredByHeader: false");
  expect(config).toContain("process.env.NEXT_PUBLIC_ASSURMATCH_API_URL");
});

test("the shared header set lets the browser reach the API and nothing else", () => {
  const headers = Object.fromEntries(securityHeadersFromEnv({ NODE_ENV: "production" }, ["https://api.assurmatch.example"]).map((header) => [header.key, header.value]));
  for (const key of [...REQUIRED, "Strict-Transport-Security"]) expect(headers[key], key).toBeTruthy();
  expect(headers["Content-Security-Policy"]).toContain("connect-src 'self' https://api.assurmatch.example");
  expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
});

test.describe("public live security headers", () => {
  const baseUrl = process.env.ASSURMATCH_E2E_PUBLIC_URL ?? process.env.ASSURMATCH_E2E_BASE_URL;
  test.skip(!baseUrl, "Set ASSURMATCH_E2E_PUBLIC_URL to check the headers of a running public app");

  test("a public page and a visitor token page answer with the expected headers", async ({ request }) => {
    const home = (await request.get(`${baseUrl}/`)).headers();
    for (const key of REQUIRED) expect(home[key.toLowerCase()], key).toBeTruthy();
    expect(home["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    const tracking = (await request.get(`${baseUrl}/suivi`)).headers();
    expect(tracking["referrer-policy"]).toBe("no-referrer");
    expect(tracking["x-robots-tag"]).toBe("noindex, nofollow");
    expect(tracking["content-security-policy"]).toBeTruthy();
  });
});
