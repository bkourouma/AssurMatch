import createNextIntlPlugin from "next-intl/plugin";
import { securityHeadersFromEnv } from "../../packages/shared/security/security-headers";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Spec 054 R8: the visitor tracking space, the tracking-link form and the satisfaction survey carry
 * (or lead to) a personal access token in the URL. They are never indexed and never send a Referer.
 * Both the localised public paths and the internal `[locale]` paths are listed.
 */
const VISITOR_TOKEN_PATHS = [
  "/demandes-de-devis/:publicReference*",
  "/en/quote-requests/:publicReference*",
  "/fr/quote-requests/:publicReference*",
  "/quote-requests/:publicReference*",
  "/suivi",
  "/en/track",
  "/fr/track",
  "/avis/:publicReference*",
  "/en/feedback/:publicReference*",
  "/fr/feedback/:publicReference*"
];

const VISITOR_TOKEN_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" }
];

const nextConfig = {
  poweredByHeader: false,
  // Next 16 hands the proxy a `NextURL` whose loopback host is canonicalised to `localhost`, but it
  // relativises the `x-middleware-rewrite` the proxy returns against an origin built from the
  // server's own `--hostname` (the local launcher binds `127.0.0.1`). The two origins never match,
  // so Next classifies every next-intl rewrite as an *external* rewrite and HTTP-proxies the request
  // back to itself; the sub-request lands on the internal path (`/fr`, `/fr/countries`) where
  // next-intl correctly redirects back to the public French URL, and the browser loops forever.
  // English never loops because its slugs already equal the folder names, so it needs no rewrite.
  // With this flag the proxy receives the same un-normalised URL Next relativises against, so the
  // rewrite stays internal. Harmless here: we have no basePath, no `i18n` config, no trailing-slash
  // rule and no Pages-Router data routes, which is all this normalisation step touches.
  skipProxyUrlNormalize: true,
  async headers() {
    return [
      // Spec 058 FR-007: CSP, HSTS (production), DENY framing, nosniff, strict-origin-when-cross-origin.
      // The browser submits quote requests to the API directly (spec 043), hence its origin in connect-src.
      { source: "/:path*", headers: securityHeadersFromEnv(process.env, [process.env.NEXT_PUBLIC_ASSURMATCH_API_URL]) },
      // Declared AFTER the general rule: for the same key Next keeps the last matching value, so the
      // visitor token pages keep `Referrer-Policy: no-referrer` (spec 054 R8).
      ...VISITOR_TOKEN_PATHS.map((source) => ({ source, headers: VISITOR_TOKEN_HEADERS }))
    ];
  },
  async redirects() {
    return [
      { source: "/catalog", destination: "/pays", permanent: true },
      { source: "/countries", destination: "/pays", permanent: true },
      { source: "/countries/:countryCode", destination: "/pays/:countryCode", permanent: true },
      {
        source: "/countries/:countryCode/products/:productKey",
        destination: "/pays/:countryCode/produits/:productKey",
        permanent: true
      },
      {
        source: "/countries/:countryCode/products/:productKey/offers",
        destination: "/pays/:countryCode/produits/:productKey/offres",
        permanent: true
      },
      {
        source: "/countries/:countryCode/products/:productKey/quote",
        destination: "/pays/:countryCode/produits/:productKey/devis",
        permanent: true
      },
      { source: "/compare", destination: "/comparer", permanent: true },
      { source: "/offers/:offerId", destination: "/offres/:offerId", permanent: true },
      {
        source: "/quote-requests/:publicReference",
        destination: "/demandes-de-devis/:publicReference",
        permanent: true
      }
    ];
  }
};

export default withNextIntl(nextConfig);
