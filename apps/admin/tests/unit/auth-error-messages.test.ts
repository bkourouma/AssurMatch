import { describe, expect, it } from "vitest";
import {
  AdminApiError,
  ERROR_MESSAGES,
  authErrorMessage,
  billingForbiddenMessage,
  containsTechnicalToken,
  errorNoticeKey,
  errorNoticeText,
  forbiddenCode,
  forbiddenWordingMessage,
  friendlyErrorMessage,
  loginNotices,
  readFailureDetail
} from "../../app/lib/auth-error-messages";

describe("authErrorMessage (statut + code)", () => {
  it("maps the new API codes to the agreed vocabulary", () => {
    expect(authErrorMessage({ status: 401, code: "INVALID_CREDENTIALS" }, "login")).toBe("Identifiants invalides.");
    expect(authErrorMessage({ status: 403, code: "ACCOUNT_SUSPENDED" }, "login")).toBe("Ce compte est suspendu. Contactez votre administrateur.");
    expect(authErrorMessage({ status: 400, code: "PASSWORD_POLICY" }, "activate")).toBe(ERROR_MESSAGES.passwordPolicy);
    expect(authErrorMessage({ status: 409, code: "EMAIL_ALREADY_USED" })).toBe("Cette adresse e-mail est déjà utilisée.");
    expect(authErrorMessage({ status: 403, code: "RBAC_DENIED" })).toBe("Vous n'avez pas le droit d'effectuer cette action.");
    expect(authErrorMessage({ status: 413, code: "PAYLOAD_TOO_LARGE" })).toBe("Le contenu envoyé est trop volumineux.");
  });

  it("tolerates the legacy statuses", () => {
    expect(authErrorMessage({ status: 400 }, "activate")).toBe(ERROR_MESSAGES.passwordPolicy);
    expect(authErrorMessage({ status: 422, code: "api_422" }, "reset")).toBe(ERROR_MESSAGES.passwordPolicy);
    expect(authErrorMessage({ status: 403 }, "login")).toBe(ERROR_MESSAGES.accountSuspended);
    expect(authErrorMessage({ status: 401 }, "login")).toBe("Identifiants invalides.");
    expect(authErrorMessage({ status: 500 }, "login")).toBe("Une erreur est survenue. Réessayez dans un instant.");
    expect(authErrorMessage({ status: 500 })).toBe(ERROR_MESSAGES.fallback);
  });

  it("never discloses a locked account: 423 reads like a wrong password", () => {
    expect(authErrorMessage({ status: 423 }, "login")).toBe("Identifiants invalides.");
  });

  it("uses one neutral message for an invalid, expired or consumed link", () => {
    expect(authErrorMessage({ status: 410 }, "activate")).toBe("Ce lien n'est plus valable. Demandez-en un nouveau.");
    expect(authErrorMessage({ status: 400, code: "ACTIVATION_TOKEN_INVALID" }, "activate")).toBe(ERROR_MESSAGES.tokenInvalid);
    expect(authErrorMessage({ status: 401 }, "reset")).toBe(ERROR_MESSAGES.tokenInvalid);
  });

  it("reports a wrong MFA code", () => {
    expect(authErrorMessage({ status: 401 }, "mfa")).toBe("Code de vérification incorrect.");
    expect(authErrorMessage({ status: 400 }, "mfa")).toBe("Code de vérification incorrect.");
  });

  it("names the refused wording", () => {
    expect(authErrorMessage({ status: 400, code: "FORBIDDEN_WORDING", wording: ["meilleur prix garanti"] })).toBe('Formulation interdite : "meilleur prix garanti". Reformulez ce libellé.');
    expect(forbiddenWordingMessage(["a", "b"])).toBe('Formulation interdite : "a", "b". Reformulez ce libellé.');
  });
});

describe("friendlyErrorMessage (exceptions)", () => {
  it("never returns a technical token or raw exception text", () => {
    for (const raw of ["api_400", "api_500", "validation_error", "action_failed", "invalid_session", "fetch failed", "Unexpected token < in JSON", "session_expired"]) {
      const message = friendlyErrorMessage(new Error(raw));
      expect(containsTechnicalToken(message), raw).toBe(false);
      expect(message, raw).not.toBe(raw);
    }
    expect(friendlyErrorMessage(new Error("api_500"))).toBe(ERROR_MESSAGES.fallback);
    expect(friendlyErrorMessage(new Error("fetch failed"))).toBe(ERROR_MESSAGES.fallback);
    expect(friendlyErrorMessage("boom")).toBe(ERROR_MESSAGES.fallback);
  });

  it("answers 'Session expirée' for a missing or expired session", () => {
    expect(friendlyErrorMessage(new Error("session_required"))).toBe("Session expirée : reconnectez-vous puis recommencez.");
    expect(friendlyErrorMessage(new AdminApiError(401, undefined, undefined, "session_expired"))).toBe(ERROR_MESSAGES.sessionExpired);
  });

  it("translates typed API errors and legacy api_<status> messages by context", () => {
    expect(friendlyErrorMessage(new AdminApiError(409, "EMAIL_ALREADY_USED"))).toBe(ERROR_MESSAGES.emailAlreadyUsed);
    expect(friendlyErrorMessage(new AdminApiError(403, "RBAC_DENIED"))).toBe(ERROR_MESSAGES.rbacDenied);
    expect(friendlyErrorMessage(new AdminApiError(400, "FORBIDDEN_WORDING", { wording: ["gratuit"] }))).toBe('Formulation interdite : "gratuit". Reformulez ce libellé.');
    expect(friendlyErrorMessage(new Error("api_400"), "reset")).toBe(ERROR_MESSAGES.passwordPolicy);
    expect(friendlyErrorMessage(new Error("api_401"), "mfa")).toBe(ERROR_MESSAGES.mfaCodeInvalid);
    expect(friendlyErrorMessage(new Error("access_denied"))).toBe(ERROR_MESSAGES.rbacDenied);
  });
});

describe("loginNotices", () => {
  it("explains every reason", () => {
    for (const reason of ["session_expired", "session_required", "session_invalid", "auth_unavailable", "mfa_required"]) {
      const notices = loginNotices({ reason });
      expect(notices, reason).toHaveLength(1);
      expect(containsTechnicalToken(notices[0]?.text ?? "")).toBe(false);
    }
    expect(loginNotices({ reason: "mfa_required" })[0]?.text).toBe("Vérification en deux étapes requise : saisissez votre code pour continuer.");
  });

  it("explains access_denied and unknown errors, with the anti-enumeration wording", () => {
    expect(loginNotices({ error: "access_denied" })[0]?.text).toContain("accès");
    expect(loginNotices({ error: "invalid_credentials" })[0]?.text).toBe("Identifiants invalides.");
    expect(loginNotices({ error: "locked" })[0]?.text).toBe("Identifiants invalides.");
    expect(loginNotices({ error: "suspended" })[0]?.text).toBe(ERROR_MESSAGES.accountSuspended);
    expect(loginNotices({ error: "invalid_session" })[0]?.text).toBe(ERROR_MESSAGES.fallback);
    expect(loginNotices({ error: "dev_login_disabled" })).toEqual([]);
    expect(loginNotices({})).toEqual([]);
  });
});

describe("billing refusal, notices and read failures", () => {
  it("tells a missing country scope from a role refusal", () => {
    expect(billingForbiddenMessage("BILLING_SCOPE_MISSING")).toBe("Aucun périmètre pays n'est affecté à votre compte : demandez-le à un administrateur plateforme.");
    expect(billingForbiddenMessage(undefined)).toBe("Votre rôle ne permet pas d'accéder à la facturation.");
    expect(billingForbiddenMessage("RBAC_DENIED")).toBe("Votre rôle ne permet pas d'accéder à la facturation.");
    expect(billingForbiddenMessage("MFA_REQUIRED")).toBe(ERROR_MESSAGES.mfaRequired);
  });

  it("recognises an MFA refusal even without a dedicated code", () => {
    expect(forbiddenCode({ code: "VALIDATION_FAILED", message: "MFA required" })).toBe("MFA_REQUIRED");
    expect(forbiddenCode({ code: "BILLING_SCOPE_MISSING", message: "x" })).toBe("BILLING_SCOPE_MISSING");
    expect(forbiddenCode({ code: "RBAC_DENIED", message: "role denied" })).toBe("RBAC_DENIED");
    expect(forbiddenCode(undefined)).toBeUndefined();
  });

  it("keeps URL notices to a closed set of keys", () => {
    expect(errorNoticeKey(new AdminApiError(403, "RBAC_DENIED"))).toBe("rbac_denied");
    expect(errorNoticeKey(new Error("api_500"))).toBe("error");
    expect(errorNoticeText("rbac_denied")).toBe(ERROR_MESSAGES.rbacDenied);
    expect(errorNoticeText("<script>")).toBeUndefined();
  });

  it("never prints the technical token of a read failure", () => {
    expect(readFailureDetail("api_500")).not.toContain("api_");
    expect(readFailureDetail("access_denied")).toBe(ERROR_MESSAGES.rbacDenied);
  });
});
