import { describe, expect, it } from "vitest";
import { clientIp, trustedProxyHops } from "../../../src/modules/common/http/request-actor";
import { validateRuntimeEnvironment } from "../../../src/config/config.module";

function request(headers: Record<string, string | string[] | undefined>, ip = "10.0.0.1") {
  return { headers, ip };
}

describe("clientIp (spec 057, PRD K-12)", () => {
  it("defaults to one trusted hop and takes the address nginx appended, never the client-supplied leftmost one", () => {
    expect(trustedProxyHops({})).toBe(1);
    expect(clientIp(request({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), {})).toBe("203.0.113.9");
  });

  it("keeps working for a single forwarded address", () => {
    expect(clientIp(request({ "x-forwarded-for": "203.0.113.20" }), {})).toBe("203.0.113.20");
  });

  it("walks the configured number of trusted hops from the right", () => {
    const env = { TRUSTED_PROXY_HOPS: "2" };
    expect(clientIp(request({ "x-forwarded-for": "6.6.6.6, 198.51.100.1, 10.0.0.2" }), env)).toBe("198.51.100.1");
    // Fewer entries than trusted hops: every entry was written by a trusted proxy, the leftmost is the client.
    expect(clientIp(request({ "x-forwarded-for": "198.51.100.1" }), env)).toBe("198.51.100.1");
  });

  it("merges repeated X-Forwarded-For headers before counting hops", () => {
    expect(clientIp(request({ "x-forwarded-for": ["6.6.6.6", "203.0.113.9"] }), {})).toBe("203.0.113.9");
  });

  it("ignores every forwarding header with zero trusted hops", () => {
    const env = { TRUSTED_PROXY_HOPS: "0" };
    expect(clientIp(request({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "7.7.7.7" }, "192.0.2.10"), env)).toBe("192.0.2.10");
  });

  it("falls back to X-Real-IP, then to the socket address", () => {
    expect(clientIp(request({ "x-real-ip": "203.0.113.30" }), {})).toBe("203.0.113.30");
    expect(clientIp(request({}, "192.0.2.11"), {})).toBe("192.0.2.11");
    expect(clientIp({ headers: {} }, {})).toBe("unknown");
  });

  it("rejects an invalid TRUSTED_PROXY_HOPS at boot", () => {
    for (const value of ["-1", "1.5", "abc", "6"]) {
      expect(() => trustedProxyHops({ TRUSTED_PROXY_HOPS: value })).toThrow(/TRUSTED_PROXY_HOPS/);
      expect(() => validateRuntimeEnvironment({ NODE_ENV: "test", TRUSTED_PROXY_HOPS: value })).toThrow(/TRUSTED_PROXY_HOPS/);
    }
  });
});
