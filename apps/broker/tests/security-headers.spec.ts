import { expect, test } from "@playwright/test";
import nextConfig from "../next.config";

// Spec 058 FR-007: the Broker Back-office serves the shared security headers on every path.
const REQUIRED = ["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy"];

test("broker next.config serves the security headers on every path", async () => {
  const rules = await nextConfig.headers();
  const all = rules.find((rule) => rule.source === "/:path*");
  expect(all).toBeTruthy();
  const headers = Object.fromEntries((all?.headers ?? []).map((header) => [header.key, header.value]));
  for (const key of REQUIRED) expect(headers[key], key).toBeTruthy();
  expect(headers["X-Frame-Options"]).toBe("DENY");
  expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  // HSTS only under NODE_ENV=production (next build / next start).
  expect(Boolean(headers["Strict-Transport-Security"])).toBe(process.env.NODE_ENV === "production");
  expect(nextConfig.poweredByHeader).toBe(false);
});

test.describe("broker live security headers", () => {
  const baseUrl = process.env.ASSURMATCH_E2E_BROKER_URL;
  test.skip(!baseUrl, "Set ASSURMATCH_E2E_BROKER_URL to check the headers of a running broker app");

  test("the login page answers with every security header", async ({ request }) => {
    const response = await request.get(`${baseUrl}/login`, { maxRedirects: 0 });
    const headers = response.headers();
    for (const key of REQUIRED) expect(headers[key.toLowerCase()], key).toBeTruthy();
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
