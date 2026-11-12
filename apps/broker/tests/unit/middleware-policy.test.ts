import { describe, expect, it } from "vitest";
import {
  decideFromMe,
  decideWithoutProfile,
  isServerActionRequest,
  type MiddlewareProfile
} from "../../app/lib/middleware-policy";

const broker: MiddlewareProfile = { roles: ["broker_owner_pro"], partnerPlan: "pro", mfaVerified: true };
const starter: MiddlewareProfile = { roles: ["broker_owner_starter"], partnerPlan: "starter", mfaVerified: true };

describe("isServerActionRequest", () => {
  it("recognises a POST carrying next-action, whatever the header case", () => {
    expect(isServerActionRequest("POST", new Headers({ "Next-Action": "abc" }))).toBe(true);
    expect(isServerActionRequest("post", new Headers({ "next-action": "abc" }))).toBe(true);
  });

  it("ignores navigations and POSTs without the header", () => {
    expect(isServerActionRequest("GET", new Headers({ "next-action": "abc" }))).toBe(false);
    expect(isServerActionRequest("POST", new Headers())).toBe(false);
  });
});

describe("decideWithoutProfile", () => {
  it("redirects a navigation without cookie to /login", () => {
    expect(decideWithoutProfile({ isAction: false, hasToken: false })).toEqual({ type: "login", reason: "session_required" });
  });

  it("lets a server action without cookie reach the action (which then refuses to write)", () => {
    expect(decideWithoutProfile({ isAction: true, hasToken: false })).toEqual({ type: "next" });
  });

  it("asks for the profile when a cookie is present", () => {
    expect(decideWithoutProfile({ isAction: false, hasToken: true })).toEqual({ type: "check_profile" });
    expect(decideWithoutProfile({ isAction: true, hasToken: true })).toEqual({ type: "check_profile" });
  });
});

describe("decideFromMe", () => {
  it("keeps the redirects for navigations", () => {
    expect(decideFromMe({ isAction: false, pathname: "/", me: { kind: "status", status: 401 } })).toEqual({ type: "login", reason: "session_expired" });
    expect(decideFromMe({ isAction: false, pathname: "/", me: { kind: "status", status: 500 } })).toEqual({ type: "login", reason: "session_invalid" });
    expect(decideFromMe({ isAction: false, pathname: "/", me: { kind: "unreachable" } })).toEqual({ type: "login", reason: "auth_unavailable" });
  });

  it("lets a server action with an expired, invalid or unreachable session through", () => {
    expect(decideFromMe({ isAction: true, pathname: "/company", me: { kind: "status", status: 401 } })).toEqual({ type: "next" });
    expect(decideFromMe({ isAction: true, pathname: "/company", me: { kind: "status", status: 403 } })).toEqual({ type: "next" });
    expect(decideFromMe({ isAction: true, pathname: "/company", me: { kind: "unreachable" } })).toEqual({ type: "next" });
  });

  it("keeps the profile control for non-action requests", () => {
    expect(decideFromMe({ isAction: false, pathname: "/", me: { kind: "profile", profile: { ...broker, mfaVerified: false } } })).toEqual({ type: "login", reason: "mfa_required" });
    expect(decideFromMe({ isAction: false, pathname: "/", me: { kind: "profile", profile: { roles: ["admin"], mfaVerified: true } } })).toEqual({ type: "access_denied" });
    expect(decideFromMe({ isAction: false, pathname: "/crm/leads", me: { kind: "profile", profile: starter } })).toEqual({ type: "starter_crm" });
    expect(decideFromMe({ isAction: false, pathname: "/crm", me: { kind: "profile", profile: starter } })).toEqual({ type: "next" });
    expect(decideFromMe({ isAction: false, pathname: "/crm/leads", me: { kind: "profile", profile: broker } })).toEqual({ type: "next" });
  });

  it("still refuses a known profile that is not allowed, even for a server action", () => {
    expect(decideFromMe({ isAction: true, pathname: "/company", me: { kind: "profile", profile: { roles: ["admin"], mfaVerified: true } } })).toEqual({ type: "access_denied" });
    expect(decideFromMe({ isAction: true, pathname: "/company", me: { kind: "profile", profile: { ...broker, mfaVerified: false } } })).toEqual({ type: "login", reason: "mfa_required" });
  });
});
