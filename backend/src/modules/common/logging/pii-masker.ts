const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\+[1-9]\d{7,14}\b/g;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
/** Spec 058: bearer credentials, JWTs and secret-carrying query parameters (`?token=...`). */
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const SECRET_QUERY_PATTERN = /([?&;](?:token|access_token|refresh_token|id_token|code|key|api_key|apikey|signature|sig|password|secret)=)[^&#\s"']*/gi;
const SENSITIVE_KEYS = new Set(["password", "secret", "token", "accessToken", "refreshToken", "authorization"]);

export function maskText(value: string): string {
  return value
    .replace(SECRET_QUERY_PATTERN, "$1[masked]")
    .replace(BEARER_PATTERN, "Bearer [masked]")
    .replace(JWT_PATTERN, "[masked-jwt]")
    .replace(EMAIL_PATTERN, "[masked-email]")
    .replace(PHONE_PATTERN, "[masked-phone]")
    .replace(UUID_PATTERN, "[masked-id]");
}

export function maskPii<T>(value: T): T {
  if (typeof value === "string") {
    return maskText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => maskPii(item)) as T;
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = SENSITIVE_KEYS.has(key) ? "[masked]" : maskPii(nested);
    }
    return output as T;
  }
  return value;
}
