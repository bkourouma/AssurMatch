import { siteUrl } from "./lib/site-config";

/** The quote journey and its confirmations are never indexed: they carry visitor data. */
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/demandes-de-devis/", "/quote-requests/", "/aller", "/*/devis"]
    },
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
