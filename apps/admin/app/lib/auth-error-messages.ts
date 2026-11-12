/**
 * Messages d'erreur lisibles du back-office admin (module pur, sans I/O, testable en vitest).
 *
 * L'API renvoie `{ code, message, correlationId }` (voir `error-response.filter.ts`). Ce module traduit
 * (statut HTTP + code) en un message français. Il tolère les anciens codes (`api_400`, `validation_error`,
 * 403 sans code...) pour rester correct pendant la transition de l'API.
 * L'utilisateur ne doit jamais voir `validation_error`, `api_400`, `api_500` ni le texte brut d'une exception.
 */

export const ERROR_MESSAGES = {
  invalidCredentials: "Identifiants invalides.",
  accountSuspended: "Ce compte est suspendu. Contactez votre administrateur.",
  passwordPolicy: "Ce mot de passe ne respecte pas la politique de sécurité : choisissez-en un plus long et plus varié.",
  emailAlreadyUsed: "Cette adresse e-mail est déjà utilisée.",
  rbacDenied: "Vous n'avez pas le droit d'effectuer cette action.",
  tokenInvalid: "Ce lien n'est plus valable. Demandez-en un nouveau.",
  payloadTooLarge: "Le contenu envoyé est trop volumineux.",
  mfaCodeInvalid: "Code de vérification incorrect.",
  fallback: "Une erreur est survenue. Réessayez dans un instant.",
  sessionExpired: "Session expirée : reconnectez-vous puis recommencez.",
  tooManyAttempts: "Trop de tentatives. Réessayez dans quelques minutes.",
  activationRequired: "Activation requise. Ouvrez l'écran d'activation avec le lien fourni par votre administrateur.",
  invalidInput: "Vérifiez les informations saisies puis recommencez.",
  mfaRequired: "Vérification en deux étapes requise : saisissez votre code pour continuer.",
  billingRole: "Votre rôle ne permet pas d'accéder à la facturation.",
  billingScope: "Aucun périmètre pays n'est affecté à votre compte : demandez-le à un administrateur plateforme.",
  dataUnavailable: "Données indisponibles pour le moment. Réessayez dans un instant.",
  conflict: "Cette action n'est pas possible dans l'état actuel. Rechargez la page puis recommencez.",
  selfActionForbidden: "Vous ne pouvez pas effectuer cette action sur votre propre compte.",
  lastSuperAdmin: "Action impossible : elle laisserait la plateforme sans Super Admin actif."
} as const;

export type AuthErrorContext = "login" | "activate" | "reset" | "password_change" | "mfa" | "generic";

export interface ApiErrorInfo {
  status?: number | undefined;
  code?: string | undefined;
  /** `details.wording` of a FORBIDDEN_WORDING refusal (the expressions the backend refused). */
  wording?: readonly string[] | undefined;
}

/** `Formulation interdite : "<formulation>". Reformulez ce libellé.` (names every refused expression). */
export function forbiddenWordingMessage(wording?: readonly string[]): string {
  const named = (wording ?? []).map((entry) => entry.trim()).filter(Boolean);
  if (named.length === 0) return "Formulation interdite dans ce libellé. Reformulez ce libellé.";
  return `Formulation interdite : ${named.map((entry) => `"${entry}"`).join(", ")}. Reformulez ce libellé.`;
}

/** Extracts `details.wording` (array of strings) from an error `details` object. */
export function wordingFromDetails(details: Record<string, unknown> | undefined): string[] | undefined {
  const wording = details?.wording;
  return Array.isArray(wording) ? wording.filter((entry): entry is string => typeof entry === "string") : undefined;
}

/** Erreur d'API portant le statut et le code du corps d'erreur (le `message` reste un jeton technique, jamais affiché). */
export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code?: string, details?: Record<string, unknown>, message?: string) {
    super(message ?? `api_${status}`);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const TOKEN_CODE = /TOKEN|LINK|EXPIRED|CONSUMED/i;

/** Lit `{ code, details }` d'un corps d'erreur JSON déjà décodé. */
export function readErrorBody(payload: unknown): { code?: string; details?: Record<string, unknown> } {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as Record<string, unknown>;
  const details = record.details && typeof record.details === "object" && !Array.isArray(record.details) ? record.details as Record<string, unknown> : undefined;
  return {
    ...(typeof record.code === "string" ? { code: record.code } : {}),
    ...(details ? { details } : {})
  };
}

/**
 * Code d'un refus 403 : le code explicite de l'API, sinon `MFA_REQUIRED` quand le message technique parle de MFA
 * (les anciens refus MFA n'avaient pas de code dédié). Le message brut n'est jamais affiché.
 */
export function forbiddenCode(payload: unknown): string | undefined {
  const { code } = readErrorBody(payload);
  const rawMessage = payload && typeof payload === "object" ? (payload as Record<string, unknown>).message : undefined;
  const message = typeof rawMessage === "string" ? rawMessage : "";
  if (code === "MFA_REQUIRED" || (code !== "BILLING_SCOPE_MISSING" && code !== "RBAC_DENIED" && /\bmfa\b/i.test(message))) return "MFA_REQUIRED";
  return code;
}

/** (statut HTTP + code) -> message français, selon l'écran d'origine. */
export function authErrorMessage(info: ApiErrorInfo, context: AuthErrorContext = "generic"): string {
  const status = info.status ?? 0;
  const code = info.code ?? "";
  if (code === "INVALID_CREDENTIALS") return ERROR_MESSAGES.invalidCredentials;
  if (code === "ACCOUNT_SUSPENDED") return ERROR_MESSAGES.accountSuspended;
  if (code === "PASSWORD_POLICY") return ERROR_MESSAGES.passwordPolicy;
  if (code === "EMAIL_ALREADY_USED") return ERROR_MESSAGES.emailAlreadyUsed;
  if (code === "RBAC_DENIED") return ERROR_MESSAGES.rbacDenied;
  if (code === "SELF_ACTION_FORBIDDEN") return ERROR_MESSAGES.selfActionForbidden;
  if (code === "LAST_SUPER_ADMIN") return ERROR_MESSAGES.lastSuperAdmin;
  if (code === "INVALID_TOKEN") return ERROR_MESSAGES.tokenInvalid;
  if (code === "FORBIDDEN_WORDING") return forbiddenWordingMessage(info.wording);
  if (code === "PAYLOAD_TOO_LARGE" || status === 413) return ERROR_MESSAGES.payloadTooLarge;
  if (code === "session_required" || code === "session_expired" || code === "AUTH_REQUIRED") return ERROR_MESSAGES.sessionExpired;
  if (code === "MFA_REQUIRED") return ERROR_MESSAGES.mfaRequired;
  if (status === 429 || code === "RATE_LIMITED") return ERROR_MESSAGES.tooManyAttempts;
  if (context !== "login" && context !== "mfa" && TOKEN_CODE.test(code)) return ERROR_MESSAGES.tokenInvalid;

  switch (context) {
    case "login":
      if (status === 401 || status === 423) return ERROR_MESSAGES.invalidCredentials; // anti-énumération : pas d'avis « verrouillé »
      if (status === 403) return ERROR_MESSAGES.accountSuspended;
      if (status === 428) return ERROR_MESSAGES.activationRequired;
      if (status === 400 || status === 422) return ERROR_MESSAGES.invalidInput;
      break;
    case "activate":
    case "reset":
      if (status === 400 || status === 422) return ERROR_MESSAGES.passwordPolicy;
      if (status === 401 || status === 403 || status === 404 || status === 409 || status === 410) return ERROR_MESSAGES.tokenInvalid;
      break;
    case "password_change":
      if (status === 400 || status === 422) return ERROR_MESSAGES.passwordPolicy;
      if (status === 401) return ERROR_MESSAGES.invalidCredentials;
      if (status === 403) return ERROR_MESSAGES.rbacDenied;
      break;
    case "mfa":
      if (status === 400 || status === 401 || status === 403 || status === 422) return ERROR_MESSAGES.mfaCodeInvalid;
      break;
    default:
      if (status === 401) return ERROR_MESSAGES.sessionExpired;
      if (status === 403) return ERROR_MESSAGES.rbacDenied;
      if (status === 409) return ERROR_MESSAGES.conflict;
      if (status === 400 || status === 422) return ERROR_MESSAGES.invalidInput;
  }
  return ERROR_MESSAGES.fallback;
}

/**
 * Message lisible pour une exception levée par la couche API. Jamais le texte brut : les jetons techniques
 * (`api_400`, `session_expired`, `validation_error`...) et toute exception inconnue sont traduits.
 */
export function friendlyErrorMessage(error: unknown, context: AuthErrorContext = "generic"): string {
  if (error instanceof AdminApiError) return authErrorMessage({ status: error.status, code: error.code, wording: wordingFromDetails(error.details) }, context);
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (raw === "session_required" || raw === "session_expired") return ERROR_MESSAGES.sessionExpired;
  if (raw === "access_denied") return ERROR_MESSAGES.rbacDenied;
  if (raw === "validation_error") return context === "activate" || context === "reset" || context === "password_change" ? ERROR_MESSAGES.passwordPolicy : ERROR_MESSAGES.invalidInput;
  const legacy = /^api_(\d{3})$/.exec(raw);
  if (legacy) return authErrorMessage({ status: Number(legacy[1]) }, context);
  return ERROR_MESSAGES.fallback;
}

const ERROR_NOTICE_KEYS: Record<string, string> = {
  session_expired: ERROR_MESSAGES.sessionExpired,
  rbac_denied: ERROR_MESSAGES.rbacDenied,
  email_used: ERROR_MESSAGES.emailAlreadyUsed,
  payload_too_large: ERROR_MESSAGES.payloadTooLarge,
  password_policy: ERROR_MESSAGES.passwordPolicy,
  invalid_input: ERROR_MESSAGES.invalidInput,
  conflict: ERROR_MESSAGES.conflict,
  self_action: ERROR_MESSAGES.selfActionForbidden,
  last_super_admin: ERROR_MESSAGES.lastSuperAdmin,
  suspended: ERROR_MESSAGES.accountSuspended,
  error: ERROR_MESSAGES.fallback
};

/** Clé d'URL (sans texte libre) du message d'erreur d'une action suivie d'une redirection : `?error=<clé>`. */
export function errorNoticeKey(error: unknown, context: AuthErrorContext = "generic"): string {
  const message = friendlyErrorMessage(error, context);
  return Object.entries(ERROR_NOTICE_KEYS).find(([, text]) => text === message)?.[0] ?? "error";
}

/** Message affichable d'une clé `?error=<clé>` ; inconnue -> undefined (rien n'est affiché, jamais de texte libre de l'URL). */
export function errorNoticeText(key: string | undefined): string | undefined {
  return key ? ERROR_NOTICE_KEYS[key] : undefined;
}

/** Texte d'un champ d'erreur de lecture (`api_500`, `access_denied`, ...) sans jamais afficher le jeton technique. */
export function readFailureMessage(error: string | undefined): string {
  if (error === "access_denied") return ERROR_MESSAGES.rbacDenied;
  if (error === "session_required" || error === "session_expired") return ERROR_MESSAGES.sessionExpired;
  return ERROR_MESSAGES.dataUnavailable;
}

/** Courte précision à la suite d'un « X indisponible. » : jamais le jeton technique (`api_500`, ...). */
export function readFailureDetail(error: string | undefined): string {
  if (error === "access_denied") return ERROR_MESSAGES.rbacDenied;
  if (error === "session_required" || error === "session_expired") return ERROR_MESSAGES.sessionExpired;
  return "Réessayez dans un instant.";
}

/** Vrai si un message affichable contient un jeton technique interdit. */
export function containsTechnicalToken(text: string): boolean {
  return /validation_error|api_\d{3}|api_unavailable|action_failed|invalid_session/.test(text);
}

export interface LoginNotice {
  tone: "info" | "danger";
  text: string;
}

const LOGIN_REASON_NOTICES: Record<string, LoginNotice> = {
  session_expired: { tone: "info", text: "Votre session a expiré. Connectez-vous à nouveau." },
  session_required: { tone: "info", text: "Connectez-vous pour accéder à l'administration." },
  session_invalid: { tone: "info", text: "Votre session n'est plus valable. Connectez-vous à nouveau." },
  auth_unavailable: { tone: "danger", text: "Le service d'authentification est momentanément indisponible. Réessayez dans un instant." },
  mfa_required: { tone: "info", text: ERROR_MESSAGES.mfaRequired },
  logged_out: { tone: "info", text: "Vous êtes déconnecté." }
};

const LOGIN_ERROR_NOTICES: Record<string, LoginNotice> = {
  activation_required: { tone: "danger", text: ERROR_MESSAGES.activationRequired },
  mfa_required: { tone: "danger", text: ERROR_MESSAGES.mfaRequired },
  locked: { tone: "danger", text: ERROR_MESSAGES.invalidCredentials },
  invalid_credentials: { tone: "danger", text: ERROR_MESSAGES.invalidCredentials },
  suspended: { tone: "danger", text: ERROR_MESSAGES.accountSuspended },
  validation_error: { tone: "danger", text: "Vérifiez le format de l'adresse e-mail et du mot de passe." },
  access_denied: { tone: "danger", text: "Ce compte n'a pas accès à l'administration. Contactez votre administrateur." },
  dev_login_missing_seed: { tone: "danger", text: "Données démo locales absentes. Relancez le seed broker démo." },
  dev_login_database: { tone: "danger", text: "Base locale indisponible pour le sélecteur démo." }
};

const SILENT_LOGIN_ERRORS = new Set(["dev_login_disabled", "dev_login_invalid"]);

/** Avis affichés par /login pour `?reason=` et `?error=` ; tout code inconnu retombe sur le message générique. */
export function loginNotices(params: { reason?: string | undefined; error?: string | undefined }): LoginNotice[] {
  const notices: LoginNotice[] = [];
  if (params.reason) {
    const notice = LOGIN_REASON_NOTICES[params.reason];
    if (notice) notices.push(notice);
  }
  if (params.error && !SILENT_LOGIN_ERRORS.has(params.error)) {
    notices.push(LOGIN_ERROR_NOTICES[params.error] ?? { tone: "danger", text: ERROR_MESSAGES.fallback });
  }
  return notices;
}

/** Cause d'un refus de lecture de la facturation : rôle, périmètre pays manquant ou MFA. */
export function billingForbiddenMessage(code: string | undefined): string {
  if (code === "BILLING_SCOPE_MISSING") return ERROR_MESSAGES.billingScope;
  if (code === "MFA_REQUIRED") return ERROR_MESSAGES.mfaRequired;
  return ERROR_MESSAGES.billingRole;
}
