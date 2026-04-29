import { describe, expect, it } from "vitest";
import { authRateLimitKeys } from "../../../src/modules/auth/rate-limit.guard";

describe("auth rate-limit keys", () => {
  it("builds separate IP and email buckets for sensitive auth endpoints", () => {
    expect(authRateLimitKeys({ route: "/auth/login", ip: "127.0.0.1", email: "USER@Example.COM" })).toEqual([
      "auth:/auth/login:ip:127.0.0.1",
      "auth:/auth/login:email:user@example.com"
    ]);
  });

  it("does not require an email bucket when email is unknown", () => {
    expect(authRateLimitKeys({ route: "/auth/mfa/verify", ip: "127.0.0.1" })).toEqual(["auth:/auth/mfa/verify:ip:127.0.0.1"]);
  });
});
