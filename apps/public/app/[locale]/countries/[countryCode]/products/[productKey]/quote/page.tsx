import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../../../../i18n/routing";
import { QuoteBlockedState, QuoteFormShell } from "../../../../../../components/quote-form";
import { TechnicalRoleNotice } from "../../../../../../components/public-journey";
import { Breadcrumb } from "../../../../../../components/ui/breadcrumb";
import { Hero } from "../../../../../../components/ui/hero";
import { ProgressBar } from "../../../../../../components/ui/progress-bar";
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
  const quoteForm = await getPublicQuoteForm(countryCode, productKey);

  const directory = await listCountryDirectory();
  const iso = countryCode.trim().toUpperCase();
  const countryName = directory.data.find((item) => item.isoCode.toUpperCase() === iso)?.name ?? iso;
  const products = await listPublicProducts(countryCode);
  const productName = products.data.find((item) => item.key === productKey)?.name ?? productKey;

  const steps = [
    { label: t("steps.contact") },
    { label: t("steps.need") },
    { label: t("steps.consent") },
    { label: t("steps.confirmation") }
  ];

  return (
    <>
      <div className="am-container">
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
      </div>

      <Hero title={t("title")} lead={t("lead")}>
        <TechnicalRoleNotice />
      </Hero>

      <Section>
        <ProgressBar
          steps={steps}
          current={1}
          label={t("progressLabel")}
          stepLabel={t("stepStatus", { current: 1, total: steps.length })}
        />
        {quoteForm.status === "success" && quoteForm.data ? (
          <QuoteFormShell
            countryCode={countryCode}
            productKey={productKey}
            quoteForm={quoteForm.data}
            selectedOfferId={selectedOfferId}
          />
        ) : (
          <QuoteBlockedState />
        )}
      </Section>
    </>
  );
}
