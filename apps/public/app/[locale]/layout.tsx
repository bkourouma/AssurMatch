import type { ReactNode } from "react";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { pickMessages } from "../../i18n/messages";
import { routing } from "../../i18n/routing";
import { bodyFont, headingFont } from "../fonts";
import { SiteFooter } from "../components/site/site-footer";
import { SiteHeader } from "../components/site/site-header";
import { LocalContactBlock } from "../components/site/local-contact-block";
import { SkipLink } from "../components/site/skip-link";
import { JsonLd } from "../components/ui/json-ld";
import { organizationJsonLd } from "../lib/seo";
import type { PageMetadata } from "../lib/seo";
import { siteUrl } from "../lib/site-config";
import "../globals.css";

/** Namespaces the client boundaries actually need; nothing else is shipped to the browser. */
const CLIENT_NAMESPACES = ["QuoteForm", "VisitorAi", "DocumentUpload", "Journey", "Api", "Common", "Forms"] as const;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale, namespace: "Metadata" });
  return {
    metadataBase: new URL(siteUrl),
    title: { default: t("defaultTitle"), template: "%s | AssurMatch" },
    description: t("defaultDescription"),
    applicationName: t("siteName")
  };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();
  const t = await getTranslations("Layout");

  return (
    <html lang={locale} className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={pickMessages(messages, CLIENT_NAMESPACES)}>
          <div className="am-shell">
            <SkipLink label={t("skipToContent")} />
            <SiteHeader locale={locale} />
            <main className="am-main" id="contenu">
              {children}
            </main>
            <LocalContactBlock />
            <SiteFooter locale={locale} />
          </div>
        </NextIntlClientProvider>
        <JsonLd data={organizationJsonLd(locale)} />
      </body>
    </html>
  );
}
