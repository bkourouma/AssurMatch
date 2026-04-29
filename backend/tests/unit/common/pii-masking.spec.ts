import { describe, expect, it } from "vitest";
import { browserFamily, hashIp, maskEmail } from "../../../src/modules/common/pii-masking";

describe("auth PII helpers", () => {
  it("masks email local-part while keeping routing domain context", () => {
    const masked = maskEmail("Alice.Example@AssurMatch.local");
    expect(masked).not.toContain("alice");
    expect(masked).toMatch(/@assurmatch\.local$/);
  });

  it("hashes IP addresses instead of storing them plain", () => {
    const hashed = hashIp("192.0.2.10");
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toContain("192.0.2.10");
  });

  it("extracts browser family without retaining full user-agent", () => {
    expect(browserFamily("Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36")).toBe("chrome");
  });
});
