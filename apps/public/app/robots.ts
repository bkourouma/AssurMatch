import { siteUrl } from "./lib/site-config";

/**
 * The quote journey and its confirmations are never indexed: they carry visitor data. Spec 054 adds
 * the tracking space, the tracking-link form and the satisfaction survey, in both locales.
 */
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/demandes-de-devis/",
        "/quote-requests/",
        "/en/quote-requests/",
        "/suivi",
        "/en/track",
        "/avis/",
        "/en/feedback/",
        "/aller",
        "/*/devis"
      ]
    },
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
