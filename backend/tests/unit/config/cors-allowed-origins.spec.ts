import { describe, expect, it } from "vitest";
import { corsAllowedOrigins } from "../../../src/config/config.module";

describe("corsAllowedOrigins (spec 043)", () => {
  it("allows the local public app so a browser submission passes its preflight", () => {
    expect(corsAllowedOrigins({ APP_ENV: "local" })).toContain("http://127.0.0.1:3601");
  });

  it("returns nothing outside local unless origins are configured, so no environment opens by accident", () => {
    expect(corsAllowedOrigins({ APP_ENV: "production" })).toEqual([]);
    expect(corsAllowedOrigins({ APP_ENV: "preproduction" })).toEqual([]);
  });

  it("uses the configured allowlist verbatim and never a wildcard", () => {
    const origins = corsAllowedOrigins({
      APP_ENV: "production",
      CORS_ORIGINS: "https://assurmatch.example, https://www.assurmatch.example"
    });
    expect(origins).toEqual(["https://assurmatch.example", "https://www.assurmatch.example"]);
    expect(origins).not.toContain("*");
  });

  it("lets an explicit configuration override the local default", () => {
    expect(corsAllowedOrigins({ APP_ENV: "local", CORS_ORIGINS: "http://localhost:4000" }))
      .toEqual(["http://localhost:4000"]);
  });
});
