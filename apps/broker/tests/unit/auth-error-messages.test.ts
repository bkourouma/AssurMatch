import { describe, expect, it } from "vitest";
import {
  AUTH_MESSAGES,
  AuthApiError,
  authErrorMessage,
  authErrorMessageFromUnknown,
  loginErrorNotice,
  loginReasonNotice
} from "../../app/lib/auth-error-messages";

describe("authErrorMessage (lot 5 codes)", () => {
  it.each([
    ["INVALID_CREDENTIALS", 401, "Identifiants invalides."],
    ["ACCOUNT_SUSPENDED", 403, "Ce compte est suspendu. Contactez votre administrateur."],
    ["PASSWORD_POLICY", 400, "Ce mot de passe ne respecte pas la politique de sécurité : choisissez-en un plus long et plus varié."],
    ["EMAIL_ALREADY_USED", 409, "Cette adresse e-mail est déjà utilisée."],
    ["RBAC_DENIED", 403, "Vous n'avez pas le droit d'effectuer cette action."],
    ["PAYLOAD_TOO_LARGE", 413, "Le contenu envoyé est trop volumineux."]
  ])("%s", (code, status, expected) => {
    expect(authErrorMessage({ status, code })).toBe(expected);
  });
});

describe("authErrorMessage (legacy statuses)", () => {
  it("maps 400/422 to the password policy on activation and reset", () => {
    expect(authErrorMessage({ status: 400, context: "activate" })).toBe(AUTH_MESSAGES.passwordPolicy);
    expect(authErrorMessage({ status: 422, context: "password_reset" })).toBe(AUTH_MESSAGES.passwordPolicy);
  });

  it("maps a refused token to the neutral link message", () => {
    expect(authErrorMessage({ status: 401, context: "activate" })).toBe("Ce lien n'est plus valable. Demandez-en un nouveau.");
    expect(authErrorMessage({ status: 404, context: "password_reset" })).toBe("Ce lien n'est plus valable. Demandez-en un nouveau.");
  });

  it("maps login 401 to invalid credentials, 423 too (no lock notice), 403 to suspended", () => {
    expect(authErrorMessage({ status: 401, context: "login" })).toBe("Identifiants invalides.");
    expect(authErrorMessage({ status: 423, context: "login" })).toBe("Identifiants invalides.");
    expect(authErrorMessage({ status: 403, context: "login" })).toBe(AUTH_MESSAGES.accountSuspended);
  });

  it("maps a wrong MFA code", () => {
    expect(authErrorMessage({ status: 401, context: "mfa" })).toBe("Code de vérification incorrect.");
    expect(authErrorMessage({ status: 400, context: "mfa" })).toBe("Code de vérification incorrect.");
  });

  it("maps 500, 0 and unknown statuses to the generic message", () => {
    for (const status of [500, 502, 0, undefined]) {
      expect(authErrorMessage({ status, context: "login" })).toBe("Une erreur est survenue. Réessayez dans un instant.");
    }
  });

  it("maps a missing session to the session message", () => {
    expect(authErrorMessage({ status: 401, code: "session_required" })).toBe(AUTH_MESSAGES.sessionExpired);
  });
});

describe("authErrorMessageFromUnknown", () => {
  it("never exposes the raw text of an exception or an api_ code", () => {
    expect(authErrorMessageFromUnknown(new Error("api_400"), "password_change")).toBe(AUTH_MESSAGES.fallback);
    expect(authErrorMessageFromUnknown(new Error("connect ECONNREFUSED"), "mfa")).toBe(AUTH_MESSAGES.fallback);
    expect(authErrorMessageFromUnknown("boom", "generic")).toBe(AUTH_MESSAGES.fallback);
  });

  it("uses the status and code of an AuthApiError", () => {
    expect(authErrorMessageFromUnknown(new AuthApiError(400, "PASSWORD_POLICY"), "password_change")).toBe(AUTH_MESSAGES.passwordPolicy);
    expect(authErrorMessageFromUnknown(new AuthApiError(401), "mfa")).toBe(AUTH_MESSAGES.mfaCodeInvalid);
    expect(authErrorMessageFromUnknown(new Error("session_required"), "mfa")).toBe(AUTH_MESSAGES.sessionExpired);
  });
});

describe("login notices", () => {
  it("covers every reason the middleware can send", () => {
    for (const reason of ["session_expired", "session_required", "session_invalid", "auth_unavailable", "mfa_required"]) {
      expect(loginReasonNotice(reason)?.message, reason).toBeTruthy();
    }
    expect(loginReasonNotice("mfa_required")?.message).toBe("Vérification en deux étapes requise : saisissez votre code pour continuer.");
    expect(loginReasonNotice("unknown")).toBeUndefined();
  });

  it("shows the same text for invalid credentials and a locked account, never a lock notice", () => {
    expect(loginErrorNotice("invalid_credentials")?.message).toBe("Identifiants invalides.");
    expect(loginErrorNotice("locked")?.message).toBe("Identifiants invalides.");
    expect(loginErrorNotice("suspended")?.message).toBe(AUTH_MESSAGES.accountSuspended);
  });

  it("explains access_denied and never shows a raw code", () => {
    expect(loginErrorNotice("access_denied")?.message).toMatch(/Accès refusé/);
    for (const code of ["validation_error", "api_500", "invalid_session", "whatever"]) {
      const message = loginErrorNotice(code)?.message ?? "";
      expect(message).not.toMatch(/validation_error|api_\d|invalid_session|whatever/);
    }
    expect(loginErrorNotice("api_500")?.message).toBe(AUTH_MESSAGES.fallback);
    expect(loginErrorNotice(undefined)).toBeUndefined();
  });
});
