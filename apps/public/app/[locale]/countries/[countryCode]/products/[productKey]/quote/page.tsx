import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "../../../../../../../i18n/navigation";
import { toLocale } from "../../../../../../../i18n/routing";
import { QuoteBlockedState, QuoteFormShell } from "../../../../../../components/quote-form";
import { TechnicalRoleNotice } from "../../../../../../components/public-journey";
import { Breadcrumb } from "../../../../../../components/ui/breadcrumb";
import { Hero } from "../../../../../../components/ui/hero";
import { EmptyState } from "../../../../../../components/ui/empty-state";
import { Section } from "../../../../../../components/ui/section";
import { getPublicQuoteForm, listCountryDirectory, listPublicProducts } from "../../../../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../../../../lib/seo";
import type { PageMetadata } from "../../../../../../lib/seo";

/**
 * Quote request of a product. The page is never indexed: it carries visitor data. The form itself is
 * a client boundary, the page only resolves the published definition and the journey chrome.
 */

type SearchParams = Record<string, string | string[] | undefined>;
type PageParams = { locale: string; countryCode: string; productKey: string };

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, countryCode, productKey } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "QuoteForm" });
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    href: "/countries/[countryCode]/products/[productKey]/quote",
    params: { countryCode, productKey },
    locale,
    noindex: true
  });
}

export default async function PublicQuotePage({
  params,
  searchParams
}: {
  params: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
}) {
  const { locale: rawLocale, countryCode, productKey } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations("QuoteForm");
  const common = await getTranslations("Common");
  const countries = await getTranslations("Countries");

  const query = searchParams ? await searchParams : {};
  const offerIdParam = Array.isArray(query.offerId) ? query.offerId[0] : query.offerId;
  const selectedOfferId = offerIdParam && /^[0-9a-f-]{36}$/i.test(offerIdParam) ? offerIdParam : undefined;
  // Spec 050 R6: the form is requested in the page language; another language is offered, never served.
  const quoteForm = await getPublicQuoteForm(countryCode, productKey, locale, selectedOfferId);

  const directory = await listCountryDirectory();
  const iso = countryCode.trim().toUpperCase();
  const countryName = directory.data.find((item) => item.isoCode.toUpperCase() === iso)?.name ?? iso;
  const products = await listPublicProducts(countryCode);
  const productName = products.data.find((item) => item.key === productKey)?.name ?? productKey;

  return (
    <>
      <Hero
        kicker={t("kicker", { product: productName, country: countryName })}
        title={t("title")}
        lead={t("lead")}
        size="sm"
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: countries("breadcrumb"), url: localeUrl(locale, "/countries") },
              { name: countryName, url: localeUrl(locale, "/countries/[countryCode]", { countryCode }) },
              {
                name: productName,
                url: localeUrl(locale, "/countries/[countryCode]/products/[productKey]", { countryCode, productKey })
              },
              {
                name: t("breadcrumb"),
                url: localeUrl(locale, "/countries/[countryCode]/products/[productKey]/quote", { countryCode, productKey })
              }
            ]}
          />
        }
      >
        <TechnicalRoleNotice />
      </Hero>

      <Section>
        <div className="am-stack am-stack--xl am-j-column">
          {/* The stepper travels with the form: only the client boundary knows the request went
              through, and it moves to step 4 the moment it does. */}
          {quoteForm.status === "success" ? (
            <QuoteFormShell
              countryCode={countryCode}
              productKey={productKey}
              language={locale}
              quoteForm={quoteForm.data}
              selectedOfferId={selectedOfferId}
            />
          ) : quoteForm.status === "language_unavailable" ? (
            <EmptyState
              icon="globe"
              tone="muted"
              align="center"
              title={t("languageUnavailable.title")}
              description={t("languageUnavailable.description")}
              action={
                <ul className="am-stack" aria-label={t("languageUnavailable.listLabel")}>
                  {quoteForm.availableLanguages.map((language) => (
                    <li key={language}>
                      <Link
                        locale={language}
                        hrefLang={language}
                        href={{
                          pathname: "/countries/[countryCode]/products/[productKey]/quote",
                          params: { countryCode, productKey },
                          ...(selectedOfferId ? { query: { offerId: selectedOfferId } } : {})
                        }}
                      >
                        {t(`languageUnavailable.link.${language}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              }
            />
          ) : (
            <QuoteBlockedState />
          )}
        </div>
      </Section>
    </>
  );
}
