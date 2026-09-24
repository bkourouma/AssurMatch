import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

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
