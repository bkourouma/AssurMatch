import { securityHeadersFromEnv } from "../../packages/shared/security/security-headers";

/**
 * Spec 058 FR-007: Broker Back-office security headers (CSP, HSTS in production, DENY framing,
 * nosniff, strict referrer). Separate app and domain from the admin and the public site.
 */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: securityHeadersFromEnv(process.env, [process.env.NEXT_PUBLIC_ASSURMATCH_BROKER_API_URL, process.env.NEXT_PUBLIC_ASSURMATCH_API_URL])
    }];
  }
};

export default nextConfig;
