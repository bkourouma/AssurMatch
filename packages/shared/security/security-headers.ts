/**
 * Spec 058 FR-007: HTTP security headers shared by the three Next apps (Web Publique Client,
 * Back-office Plateforme, Broker Back-office). Each app's `next.config.ts` serves them on every
 * path; nginx serves the same set (deploy/nginx/security-headers.conf).
 *
 * CSP trade-off: the App Router inlines its bootstrap/flight scripts. Nonces would force dynamic
 * rendering of every page, so `script-src` keeps `'unsafe-inline'`; everything else is locked down
 * (`default-src 'self'`, explicit `connect-src`, `object-src 'none'`, `frame-ancestors 'none'`,
 * `base-uri 'self'`, `form-action 'self'`) and no third-party script is loaded by any app.
 * `'unsafe-eval'` and `ws:` are added in development only (React refresh, HMR socket).
 */
export interface SecurityHeader {
  key: string;
  value: string;
}

export interface SecurityHeadersOptions {
  /** `NODE_ENV === "production"`: HSTS and `upgrade-insecure-requests`. */
  production: boolean;
  /** `NODE_ENV === "development"` (`next dev`): eval + websocket for hot reload. */
  development?: boolean;
  /** Absolute URLs (or origins) the browser may call, e.g. the API base URL. Invalid entries are ignored. */
  connectOrigins?: Array<string | undefined>;
  /** Defaults to `strict-origin-when-cross-origin`; visitor token pages override it with `no-referrer`. */
  referrerPolicy?: string;
}

export const HSTS_VALUE = "max-age=31536000; includeSubDomains";
export const DEFAULT_REFERRER_POLICY = "strict-origin-when-cross-origin";
export const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()";

export function originOf(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export function contentSecurityPolicy(options: SecurityHeadersOptions): string {
  const connect = new Set<string>(["'self'"]);
  for (const candidate of options.connectOrigins ?? []) {
    const origin = originOf(candidate);
    if (origin) connect.add(origin);
  }
  if (options.development) {
    connect.add("ws:");
    connect.add("wss:");
  }
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(options.development ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", [...connect]],
    ["media-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["frame-src", ["'none'"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]]
  ];
  const policy = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (options.production) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function securityHeaders(options: SecurityHeadersOptions): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    ...(options.production ? [{ key: "Strict-Transport-Security", value: HSTS_VALUE }] : []),
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: options.referrerPolicy ?? DEFAULT_REFERRER_POLICY },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" }
  ];
}

/** The options every app derives from its own environment. */
export function securityHeadersFromEnv(env: Record<string, string | undefined>, connectOrigins: Array<string | undefined>): SecurityHeader[] {
  return securityHeaders({
    production: env.NODE_ENV === "production",
    development: env.NODE_ENV === "development",
    connectOrigins
  });
}
