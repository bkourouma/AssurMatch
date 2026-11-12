/**
 * Messages d'authentification lisibles du back-office courtier. Module pur (aucun import Next) :
 * il est partage par les server actions, la page /login et les tests unitaires.
 *
 * L'utilisateur ne doit jamais voir un code technique (`validation_error`, `api_400`, ...) ni le
 * texte brut d'une exception. Le vocabulaire est identique a celui du back-office admin.
 *
 * Tolerance aux anciens codes de l'API (avant le lot 5) : sans `code`, on retombe sur le statut
 * HTTP (400/422 = politique de mot de passe sur activation et reinitialisation, 401 = identifiants
 * invalides, 403 = compte suspendu a la connexion, 5xx = message generique).
 */

export const AUTH_MESSAGES = {
  invalidCredentials: "Identifiants invalides.",
  accountSuspended: "Ce compte est suspendu. Contactez votre administrateur.",
  passwordPolicy: "Ce mot de passe ne respecte pas la politique de sécurité : choisissez-en un plus long et plus varié.",
  emailAlreadyUsed: "Cette adresse e-mail est déjà utilisée.",
  rbacDenied: "Vous n'avez pas le droit d'effectuer cette action.",
  tokenInvalid: "Ce lien n'est plus valable. Demandez-en un nouveau.",
  payloadTooLarge: "Le contenu envoyé est trop volumineux.",
  mfaCodeInvalid: "Code de vérification incorrect.",
  sessionExpired: "Session expirée : reconnectez-vous puis recommencez.",
  fallback: "Une erreur est survenue. Réessayez dans un instant."
} as const;

export type AuthErrorContext = "login" | "activate" | "password_reset" | "password_change" | "mfa" | "generic";

export interface AuthErrorInput {
  status?: number | undefined;
  code?: string | undefined;
  context?: AuthErrorContext | undefined;
}

/** Erreur d'un appel d'authentification a l'API : porte uniquement le statut et le code machine. */
export class AuthApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, code?: string) {
    super(code ? `auth_api_${status}_${code}` : `auth_api_${status}`);
    this.name = "AuthApiError";
    this.status = status;
    this.code = code;
  }
}

/** Lit le `code` machine d'un corps d'erreur de l'API, sans jamais lever. */
export async function readErrorCode(response: Response): Promise<string | undefined> {
  const payload = await response.json().catch(() => undefined) as unknown;
  if (!payload || typeof payload !== "object") return undefined;
  const code = (payload as Record<string, unknown>).code;
  return typeof code === "string" ? code : undefined;
}

export function authErrorMessage(input: AuthErrorInput): string {
  const { status, code } = input;
  const context = input.context ?? "generic";
  switch (code) {
    case "INVALID_CREDENTIALS": return AUTH_MESSAGES.invalidCredentials;
    case "ACCOUNT_SUSPENDED": return AUTH_MESSAGES.accountSuspended;
    case "PASSWORD_POLICY": return AUTH_MESSAGES.passwordPolicy;
    case "EMAIL_ALREADY_USED": return AUTH_MESSAGES.emailAlreadyUsed;
    case "RBAC_DENIED": return AUTH_MESSAGES.rbacDenied;
    case "INVALID_TOKEN": return AUTH_MESSAGES.tokenInvalid;
    case "PAYLOAD_TOO_LARGE": return AUTH_MESSAGES.payloadTooLarge;
    case "session_required": return AUTH_MESSAGES.sessionExpired;
    default: break;
  }
  if (status === 413) return AUTH_MESSAGES.payloadTooLarge;
  if (status === undefined || status === 0 || status >= 500) return AUTH_MESSAGES.fallback;

  if (context === "mfa") {
    if (status === 400 || status === 401 || status === 403 || status === 422) return AUTH_MESSAGES.mfaCodeInvalid;
    return AUTH_MESSAGES.fallback;
  }
  if (context === "activate" || context === "password_reset") {
    if (status === 400 || status === 422) return AUTH_MESSAGES.passwordPolicy;
    if (status === 401 || status === 403 || status === 404 || status === 410) return AUTH_MESSAGES.tokenInvalid;
    return AUTH_MESSAGES.fallback;
  }
  if (context === "password_change") {
    if (status === 400 || status === 422) return AUTH_MESSAGES.passwordPolicy;
    if (status === 401) return AUTH_MESSAGES.invalidCredentials;
    if (status === 403) return AUTH_MESSAGES.rbacDenied;
    return AUTH_MESSAGES.fallback;
  }
  if (context === "login") {
    if (status === 401 || status === 423) return AUTH_MESSAGES.invalidCredentials;
    if (status === 403) return AUTH_MESSAGES.accountSuspended;
    return AUTH_MESSAGES.fallback;
  }
  if (status === 401) return AUTH_MESSAGES.sessionExpired;
  if (status === 403) return AUTH_MESSAGES.rbacDenied;
  return AUTH_MESSAGES.fallback;
}

/** Message affichable pour une exception d'une action d'authentification (jamais son texte brut). */
export function authErrorMessageFromUnknown(error: unknown, context: AuthErrorContext): string {
  if (error instanceof AuthApiError) return authErrorMessage({ status: error.status, code: error.code, context });
  if (error instanceof Error && error.message === "session_required") return AUTH_MESSAGES.sessionExpired;
  return AUTH_MESSAGES.fallback;
}

/* ----------------------------------------------------------------------------- page /login */

export type LoginNoticeTone = "info" | "danger";
export interface LoginNotice {
  tone: LoginNoticeTone;
  message: string;
}

const LOGIN_REASON_NOTICES: Record<string, LoginNotice> = {
  session_expired: { tone: "info", message: "Votre session a expiré. Connectez-vous à nouveau." },
  session_required: { tone: "info", message: "Connectez-vous pour accéder au back-office." },
  session_invalid: { tone: "info", message: "Votre session n'est plus valide. Connectez-vous à nouveau." },
  auth_unavailable: { tone: "danger", message: "Le service d'authentification est momentanément indisponible. Réessayez dans un instant." },
  mfa_required: { tone: "info", message: "Vérification en deux étapes requise : saisissez votre code pour continuer." },
  logged_out: { tone: "info", message: "Vous êtes déconnecté." }
};

const LOGIN_ERROR_NOTICES: Record<string, LoginNotice> = {
  activation_required: { tone: "danger", message: "Activation requise. Ouvrez l'écran d'activation avec le jeton fourni par votre administrateur." },
  mfa_required: { tone: "danger", message: "MFA requise. Terminez la vérification MFA avant d'ouvrir le back-office courtier." },
  // Anti-enumeration: an unknown e-mail, a wrong password and a locked account read the same.
  invalid_credentials: { tone: "danger", message: AUTH_MESSAGES.invalidCredentials },
  locked: { tone: "danger", message: AUTH_MESSAGES.invalidCredentials },
  suspended: { tone: "danger", message: AUTH_MESSAGES.accountSuspended },
  validation_error: { tone: "danger", message: "Vérifiez le format de l'e-mail et du mot de passe." },
  access_denied: { tone: "danger", message: "Accès refusé : ce compte n'a pas accès au back-office courtier." },
  dev_login_missing_seed: { tone: "danger", message: "Données démo locales absentes. Relancez le seed broker démo." },
  dev_login_database: { tone: "danger", message: "Base locale indisponible pour le sélecteur démo." },
  dev_login_disabled: { tone: "danger", message: AUTH_MESSAGES.fallback },
  dev_login_invalid: { tone: "danger", message: AUTH_MESSAGES.invalidCredentials }
};

/** Avis a afficher pour `?reason=` (information de session). */
export function loginReasonNotice(reason: string | undefined): LoginNotice | undefined {
  return reason ? LOGIN_REASON_NOTICES[reason] : undefined;
}

/** Avis a afficher pour `?error=`; un code inconnu donne le message generique, jamais le code. */
export function loginErrorNotice(error: string | undefined): LoginNotice | undefined {
  if (!error) return undefined;
  return LOGIN_ERROR_NOTICES[error] ?? { tone: "danger", message: AUTH_MESSAGES.fallback };
}
