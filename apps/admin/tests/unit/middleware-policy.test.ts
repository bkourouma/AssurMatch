import { describe, expect, it } from "vitest";
import { decideAccess, isServerActionRequest } from "../../app/lib/middleware-policy";

const admin = { roles: ["super_admin"], mfaVerified: true };

describe("isServerActionRequest", () => {
  it("detects the next-action header on a POST, case-insensitively", () => {
    expect(isServerActionRequest("POST", new Headers({ "Next-Action": "abc123" }))).toBe(true);
    expect(isServerActionRequest("post", new Headers({ "next-action": "abc123" }))).toBe(true);
    expect(isServerActionRequest("POST", { "NEXT-ACTION": "abc" })).toBe(true);
  });

  it("ignores plain navigations and POSTs without the header", () => {
    expect(isServerActionRequest("GET", new Headers({ "next-action": "abc" }))).toBe(false);
    expect(isServerActionRequest("POST", new Headers({ "content-type": "text/plain" }))).toBe(false);
  });
});

describe("decideAccess", () => {
  it("redirects a page request without a session to /login", () => {
    expect(decideAccess({ isServerAction: false, outcome: { kind: "no_token" } })).toEqual({ type: "login", reason: "session_required" });
    expect(decideAccess({ isServerAction: false, outcome: { kind: "api_status", status: 401 } })).toEqual({ type: "login", reason: "session_expired" });
    expect(decideAccess({ isServerAction: false, outcome: { kind: "api_status", status: 500 } })).toEqual({ type: "login", reason: "session_invalid" });
    expect(decideAccess({ isServerAction: false, outcome: { kind: "unreachable" } })).toEqual({ type: "login", reason: "auth_unavailable" });
    expect(decideAccess({ isServerAction: false, outcome: { kind: "profile", profile: { roles: ["super_admin"], mfaVerified: false } } })).toEqual({ type: "login", reason: "mfa_required" });
  });

  it("lets a server action through without a session: the action answers 'Session expirée'", () => {
    expect(decideAccess({ isServerAction: true, outcome: { kind: "no_token" } })).toEqual({ type: "next" });
    expect(decideAccess({ isServerAction: true, outcome: { kind: "api_status", status: 401 } })).toEqual({ type: "next" });
    expect(decideAccess({ isServerAction: true, outcome: { kind: "unreachable" } })).toEqual({ type: "next" });
    expect(decideAccess({ isServerAction: true, outcome: { kind: "profile", profile: { roles: ["super_admin"], mfaVerified: false } } })).toEqual({ type: "next" });
  });

  it("accepts a verified admin profile", () => {
    expect(decideAccess({ isServerAction: false, outcome: { kind: "profile", profile: admin } })).toEqual({ type: "next" });
  });

  it("denies a verified non-admin profile, server action or not", () => {
    const broker = { roles: ["broker_owner"], mfaVerified: true };
    expect(decideAccess({ isServerAction: false, outcome: { kind: "profile", profile: broker } })).toEqual({ type: "access_denied" });
    expect(decideAccess({ isServerAction: true, outcome: { kind: "profile", profile: broker } })).toEqual({ type: "access_denied" });
  });
});
