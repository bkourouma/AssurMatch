import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders, securityHeadersFromEnv } from "../../../../packages/shared/security/security-headers";

const REQUIRED = ["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy"];

function asMap(headers: Array<{ key: string; value: string }>): Record<string, string> {
  return Object.fromEntries(headers.map((header) => [header.key, header.value]));
}

describe("shared security headers (spec 058 FR-007)", () => {
  it("serves every required header, HSTS and upgrade-insecure-requests in production only", () => {
    const production = asMap(securityHeaders({ production: true, connectOrigins: ["https://api.assurmatch.example/v1"] }));
    for (const key of [...REQUIRED, "Strict-Transport-Security"]) expect(production[key], key).toBeTruthy();
    expect(production["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    expect(production["X-Frame-Options"]).toBe("DENY");
    expect(production["X-Content-Type-Options"]).toBe("nosniff");
    expect(production["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(production["Content-Security-Policy"]).toContain("upgrade-insecure-requests");

    const local = asMap(securityHeaders({ production: false, development: true }));
    for (const key of REQUIRED) expect(local[key], key).toBeTruthy();
    expect(local["Strict-Transport-Security"]).toBeUndefined();
    expect(local["Content-Security-Policy"]).not.toContain("upgrade-insecure-requests");
  });

  it("builds a CSP compatible with Next (inline bootstrap) and locked down elsewhere", () => {
    const csp = contentSecurityPolicy({ production: true, connectOrigins: ["https://api.assurmatch.example/v1", "not a url", undefined] });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self' https://api.assurmatch.example");
    expect(csp).not.toContain("not a url");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("allows eval and the HMR websocket under next dev only", () => {
    const dev = contentSecurityPolicy({ production: false, development: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toMatch(/connect-src 'self' ws: wss:/);
    const fromEnv = asMap(securityHeadersFromEnv({ NODE_ENV: "production" }, ["http://127.0.0.1:3600"]));
    expect(fromEnv["Strict-Transport-Security"]).toBeTruthy();
    expect(fromEnv["Content-Security-Policy"]).toContain("http://127.0.0.1:3600");
  });
});
