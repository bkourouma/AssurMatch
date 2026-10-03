import { securityHeadersFromEnv } from "../../packages/shared/security/security-headers";

/**
 * Spec 058 FR-007: Back-office Plateforme security headers (CSP, HSTS in production, DENY framing,
 * nosniff, strict referrer). The browser only talks to this app and, for a few client calls, the API.
 */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: securityHeadersFromEnv(process.env, [process.env.NEXT_PUBLIC_ASSURMATCH_ADMIN_API_URL, process.env.NEXT_PUBLIC_ASSURMATCH_API_URL])
    }];
  }
};

export default nextConfig;
